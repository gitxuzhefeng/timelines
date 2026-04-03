//! 截图落盘后的异步 OCR：黑名单、节流、相似跳过、写 `snapshot_ocr`。

use std::collections::HashMap;
use std::path::Path;
use std::sync::{
    atomic::{AtomicBool, AtomicI64, AtomicUsize, Ordering},
    Arc, RwLock,
};
use std::thread;

use chrono::Utc;
use crossbeam_channel::Receiver;
use log::warn;
use parking_lot::Mutex;
use rusqlite::Connection;

use crate::core::models::{SnapshotOcrRow, WriteEvent};
use crate::core::settings::{app_name_blacklisted, get_ocr_pipeline_config};
use crate::core::writer::WriterHandle;

use super::engine::{fts_normalize, ocr_image_file};

#[derive(Debug, Clone)]
pub struct OcrJob {
    pub snapshot_id: String,
    pub session_id: String,
    pub file_path: String,
    pub captured_at_ms: i64,
    pub trigger_type: String,
    pub perceptual_hash: Option<String>,
}

const MIN_INTERVAL_MS: i64 = 8_000;

#[allow(clippy::too_many_arguments)]
pub fn spawn_ocr_worker(
    rx: Receiver<OcrJob>,
    writer: WriterHandle,
    read_conn: Arc<Mutex<Connection>>,
    ocr_enabled: Arc<AtomicBool>,
    app_blacklist: Arc<RwLock<Vec<String>>>,
    ocr_last_success_ms: Arc<AtomicI64>,
    ocr_last_error: Arc<Mutex<Option<String>>>,
    ocr_pending: Arc<AtomicUsize>,
) {
    thread::spawn(move || {
        let mut last_by_session: HashMap<String, i64> = HashMap::new();
        let mut last_phash: HashMap<String, String> = HashMap::new();
        while let Ok(job) = rx.recv() {
            ocr_pending.fetch_sub(1, Ordering::Relaxed);
            if !ocr_enabled.load(Ordering::Relaxed) {
                continue;
            }
            let list = app_blacklist
                .read()
                .ok()
                .map(|g| g.clone())
                .unwrap_or_default();
            let app_name: String = read_conn
                .lock()
                .query_row(
                    "SELECT app_name FROM window_sessions WHERE id = ?1",
                    [&job.session_id],
                    |r| r.get(0),
                )
                .unwrap_or_else(|_| "unknown".into());
            if app_name_blacklisted(&app_name, &list) {
                continue;
            }
            let now = Utc::now().timestamp_millis();
            if let Some(ts) = last_by_session.get(&job.session_id) {
                if now - *ts < MIN_INTERVAL_MS {
                    continue;
                }
            }
            if job.trigger_type == "poll" {
                if let Some(ref ph) = job.perceptual_hash {
                    if let Some(prev) = last_phash.get(&job.session_id) {
                        if prev == ph {
                            continue;
                        }
                    }
                }
            }
            let path = Path::new(&job.file_path);
            if !path.exists() {
                let merge = merge_session_summary(
                    &read_conn,
                    &job.session_id,
                    None,
                    None,
                    Some("截图文件缺失或已清理"),
                );
                send_row(
                    &writer,
                    fail_row(
                        &job,
                        "文件不存在或已清理",
                        now,
                        merge,
                    ),
                );
                continue;
            }
            let pipeline_cfg = {
                let g = read_conn.lock();
                get_ocr_pipeline_config(&g)
            };
            match ocr_image_file(path, &pipeline_cfg) {
                Ok(outcome) => {
                    let text = outcome.text;
                    let summary = outcome.summary;
                    let had_redaction = outcome.had_redaction;
                    let has_gated_text = outcome.has_gated_text;
                    let ocr_meta = outcome.ocr_meta;
                    last_by_session.insert(job.session_id.clone(), now);
                    if let Some(ref ph) = job.perceptual_hash {
                        last_phash.insert(job.session_id.clone(), ph.clone());
                    }
                    if !has_gated_text {
                        let merge = merge_session_summary(
                            &read_conn,
                            &job.session_id,
                            None,
                            None,
                            Some("未识别到可靠文字"),
                        );
                        send_row(
                            &writer,
                            SnapshotOcrRow {
                                snapshot_id: job.snapshot_id.clone(),
                                session_id: job.session_id.clone(),
                                captured_at_ms: job.captured_at_ms,
                                ocr_text: None,
                                ocr_meta,
                                fts_body: None,
                                redacted: 0,
                                status: "no_text".into(),
                                error_hint: None,
                                processed_at_ms: now,
                                update_session_context: merge.update,
                                session_summary_line: merge.summary_line,
                                session_summary_source: merge.summary_source.clone(),
                                session_empty_reason: merge.empty_reason.clone(),
                            },
                        );
                        continue;
                    }
                    let redacted_i: i64 = if had_redaction { 1 } else { 0 };
                    let fts_body = if had_redaction || text.trim().is_empty() {
                        None
                    } else {
                        Some(fts_normalize(&text))
                    };
                    let ocr_text = if text.is_empty() {
                        None
                    } else {
                        Some(text.clone())
                    };
                    let empty_reason = if summary.is_none() && text.trim().is_empty() {
                        Some("未识别到可靠文字")
                    } else {
                        None
                    };
                    let merge = merge_session_summary(
                        &read_conn,
                        &job.session_id,
                        summary.clone(),
                        if summary.is_some() {
                            Some("ocr_title")
                        } else {
                            None
                        },
                        empty_reason,
                    );
                    if !text.trim().is_empty() && redacted_i == 0 {
                        ocr_last_success_ms.store(now, Ordering::Relaxed);
                        *ocr_last_error.lock() = None;
                    } else if text.trim().is_empty() {
                        *ocr_last_error.lock() = None;
                    }
                    send_row(
                        &writer,
                        SnapshotOcrRow {
                            snapshot_id: job.snapshot_id.clone(),
                            session_id: job.session_id.clone(),
                            captured_at_ms: job.captured_at_ms,
                            ocr_text,
                            ocr_meta,
                            fts_body,
                            redacted: redacted_i,
                            status: "ok".into(),
                            error_hint: None,
                            processed_at_ms: now,
                            update_session_context: merge.update,
                            session_summary_line: merge.summary_line,
                            session_summary_source: merge.summary_source.clone(),
                            session_empty_reason: merge.empty_reason.clone(),
                        },
                    );
                }
                Err(e) => {
                    *ocr_last_error.lock() = Some(truncate_err(&e));
                    let merge = merge_session_summary(
                        &read_conn,
                        &job.session_id,
                        None,
                        None,
                        Some("OCR 引擎异常"),
                    );
                    send_row(&writer, fail_row(&job, &e, now, merge));
                }
            }
        }
    });
}

struct MergeOut {
    update: bool,
    summary_line: Option<String>,
    summary_source: Option<String>,
    empty_reason: Option<String>,
}

fn merge_session_summary(
    read_conn: &Arc<Mutex<Connection>>,
    session_id: &str,
    new_summary: Option<String>,
    new_source: Option<&str>,
    empty_reason: Option<&str>,
) -> MergeOut {
    let g = read_conn.lock();
    let prev_line: Option<String> = match g.query_row(
        "SELECT summary_line FROM session_ocr_context WHERE session_id = ?1",
        [session_id],
        |r| r.get::<_, Option<String>>(0),
    ) {
        Ok(v) => v,
        Err(rusqlite::Error::QueryReturnedNoRows) => None,
        Err(_) => None,
    };
    drop(g);
    let mut update = false;
    let mut summary_line = prev_line.clone();
    let mut out_source: Option<String> = None;
    let mut er: Option<String> = None;
    if let Some(ns) = new_summary {
        let take = match &prev_line {
            None => true,
            Some(p) => ns.chars().count() > p.chars().count(),
        };
        if take {
            summary_line = Some(ns);
            out_source = new_source.map(String::from);
            update = true;
            er = None;
        }
    } else if let Some(reason) = empty_reason {
        if prev_line.is_none() {
            er = Some(reason.into());
            update = true;
        }
    }
    MergeOut {
        update,
        summary_line,
        summary_source: out_source,
        empty_reason: er,
    }
}

fn fail_row(job: &OcrJob, err: &str, processed_at_ms: i64, merge: MergeOut) -> SnapshotOcrRow {
    SnapshotOcrRow {
        snapshot_id: job.snapshot_id.clone(),
        session_id: job.session_id.clone(),
        captured_at_ms: job.captured_at_ms,
        ocr_text: None,
        ocr_meta: None,
        fts_body: None,
        redacted: 0,
        status: "failed".into(),
        error_hint: Some(truncate_err(err)),
        processed_at_ms,
        update_session_context: merge.update,
        session_summary_line: merge.summary_line,
        session_summary_source: merge.summary_source,
        session_empty_reason: merge.empty_reason,
    }
}

fn send_row(writer: &WriterHandle, row: SnapshotOcrRow) {
    if writer.try_send(WriteEvent::SnapshotOcr(row)).is_err() {
        warn!("writer queue full, SnapshotOcr dropped");
    }
}

fn truncate_err(s: &str) -> String {
    const MAX: usize = 240;
    if s.len() <= MAX {
        s.to_string()
    } else {
        format!("{}…", &s[..MAX])
    }
}
