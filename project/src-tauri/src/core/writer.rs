use std::sync::atomic::{AtomicU32, AtomicU64, Ordering as AtomicOrdering};
use std::sync::Arc;
use std::time::Instant;

use crossbeam_channel::{bounded, Receiver, Sender, TrySendError};
use log::{error, warn};
use rusqlite::{params, Connection};

use super::models::{SessionUpdateOp, WriteEvent};

const QUEUE_CAP: usize = 256;
const BATCH_MAX: usize = 64;

#[derive(Debug, Default)]
pub struct WriterMetrics {
    pub total_batches: AtomicU64,
    pub total_events: AtomicU64,
    pub batch_latency_sum_ms: AtomicU64,
    pub last_batch_events: AtomicU32,
    pub last_batch_ms: AtomicU64,
}

impl WriterMetrics {
    pub fn snapshot(&self, pending_estimate: u32) -> crate::core::models::WriterStats {
        let batches = self.total_batches.load(AtomicOrdering::Relaxed);
        let events = self.total_events.load(AtomicOrdering::Relaxed);
        let sum = self.batch_latency_sum_ms.load(AtomicOrdering::Relaxed);
        let avg_batch = if batches > 0 {
            events as f64 / batches as f64
        } else {
            0.0
        };
        let avg_lat = if batches > 0 {
            sum as f64 / batches as f64
        } else {
            0.0
        };
        crate::core::models::WriterStats {
            total_batches: batches,
            total_events: events,
            avg_batch_size: avg_batch,
            avg_latency_ms: avg_lat,
            last_batch_events: self.last_batch_events.load(AtomicOrdering::Relaxed),
            last_batch_ms: self.last_batch_ms.load(AtomicOrdering::Relaxed),
            channel_pending_estimate: pending_estimate,
        }
    }
}

fn event_sort_key(e: &WriteEvent) -> u8 {
    match e {
        WriteEvent::SessionUpdate(_) => 0,
        WriteEvent::AppSwitch(_) => 1,
        WriteEvent::RawEvent(_) => 2,
        WriteEvent::Snapshot(_) => 3,
        WriteEvent::SnapshotOcr(_) => 4,
        WriteEvent::InputMetric(_) => 5,
        WriteEvent::ClipboardFlow(_) => 6,
        WriteEvent::Notification(_) => 7,
        WriteEvent::AmbientContext(_) => 8,
        WriteEvent::NudgeLog(_) => 8,
        WriteEvent::Retention { .. } => 9,
        WriteEvent::WalCheckpoint => 10,
        WriteEvent::Shutdown => 0,
    }
}

#[derive(Clone)]
pub struct WriterHandle {
    pub tx: Sender<WriteEvent>,
    pub metrics: Arc<WriterMetrics>,
}

impl WriterHandle {
    pub fn try_send(&self, ev: WriteEvent) -> Result<(), WriteEvent> {
        match self.tx.try_send(ev) {
            Ok(()) => Ok(()),
            Err(TrySendError::Full(ev)) => {
                warn!("writer queue full, dropping event");
                Err(ev)
            }
            Err(TrySendError::Disconnected(ev)) => Err(ev),
        }
    }
}

pub fn spawn_writer_thread(mut conn: Connection, metrics: Arc<WriterMetrics>) -> WriterHandle {
    let (tx, rx) = bounded(QUEUE_CAP);
    let metrics_thread = metrics.clone();
    std::thread::spawn(move || writer_loop(&mut conn, rx, metrics_thread));
    WriterHandle { tx, metrics }
}

fn writer_loop(conn: &mut Connection, rx: Receiver<WriteEvent>, metrics: Arc<WriterMetrics>) {
    loop {
        let first = match rx.recv() {
            Ok(e) => e,
            Err(_) => break,
        };
        if matches!(first, WriteEvent::Shutdown) {
            let _ = super::storage::db::wal_checkpoint(conn);
            break;
        }
        let mut batch = vec![first];
        while batch.len() < BATCH_MAX {
            match rx.try_recv() {
                Ok(e) => {
                    if matches!(e, WriteEvent::Shutdown) {
                        batch.push(e);
                        break;
                    }
                    batch.push(e);
                }
                Err(_) => break,
            }
        }
        let has_shutdown = batch.iter().any(|e| matches!(e, WriteEvent::Shutdown));
        batch.sort_by(|a, b| event_sort_key(a).cmp(&event_sort_key(b)));
        let started = Instant::now();
        let n = batch.len() as u64;
        if let Err(e) = apply_batch(conn, &batch) {
            error!("writer batch failed: {e}");
        }
        let ms = started.elapsed().as_millis() as u64;
        metrics.total_batches.fetch_add(1, AtomicOrdering::Relaxed);
        metrics.total_events.fetch_add(n, AtomicOrdering::Relaxed);
        metrics
            .batch_latency_sum_ms
            .fetch_add(ms, AtomicOrdering::Relaxed);
        metrics
            .last_batch_events
            .store(n as u32, AtomicOrdering::Relaxed);
        metrics.last_batch_ms.store(ms, AtomicOrdering::Relaxed);
        if has_shutdown {
            let _ = super::storage::db::wal_checkpoint(conn);
            break;
        }
    }
}

fn apply_batch(conn: &mut Connection, batch: &[WriteEvent]) -> rusqlite::Result<()> {
    let tx = conn.transaction()?;
    for ev in batch {
        match ev {
            WriteEvent::RawEvent(r) => {
                tx.execute(
                    r#"INSERT INTO raw_events (
                        id, timestamp_ms, app_name, bundle_id, window_title,
                        extracted_url, extracted_file_path, idle_seconds,
                        is_fullscreen, is_audio_playing, state_hash, trigger_type, created_at
                    ) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12, ?13)"#,
                    params![
                        r.id,
                        r.timestamp_ms,
                        r.app_name,
                        r.bundle_id,
                        r.window_title,
                        r.extracted_url,
                        r.extracted_file_path,
                        r.idle_seconds,
                        r.is_fullscreen,
                        r.is_audio_playing,
                        r.state_hash,
                        r.trigger_type,
                        r.created_at,
                    ],
                )?;
                let now = r.timestamp_ms;
                tx.execute(
                    r#"INSERT INTO app_meta (app_name, bundle_id, first_seen_ms, last_seen_ms)
                    VALUES (?1, ?2, ?3, ?4)
                    ON CONFLICT(app_name) DO UPDATE SET
                        bundle_id = COALESCE(excluded.bundle_id, app_meta.bundle_id),
                        last_seen_ms = excluded.last_seen_ms"#,
                    params![r.app_name, r.bundle_id, now, now],
                )?;
            }
            WriteEvent::AppSwitch(s) => {
                tx.execute(
                    r#"INSERT INTO app_switches (
                        id, timestamp_ms, from_app, from_bundle_id, from_window_title,
                        to_app, to_bundle_id, to_window_title, from_session_duration_ms, switch_type
                    ) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10)"#,
                    params![
                        s.id,
                        s.timestamp_ms,
                        s.from_app,
                        s.from_bundle_id,
                        s.from_window_title,
                        s.to_app,
                        s.to_bundle_id,
                        s.to_window_title,
                        s.from_session_duration_ms,
                        s.switch_type,
                    ],
                )?;
            }
            WriteEvent::Snapshot(s) => {
                tx.execute(
                    r#"INSERT INTO snapshots (
                        id, session_id, file_path, captured_at_ms, file_size_bytes,
                        trigger_type, resolution, format, perceptual_hash
                    ) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9)"#,
                    params![
                        s.id,
                        s.session_id,
                        s.file_path,
                        s.captured_at_ms,
                        s.file_size_bytes,
                        s.trigger_type,
                        s.resolution,
                        s.format,
                        s.perceptual_hash,
                    ],
                )?;
            }
            WriteEvent::SnapshotOcr(r) => {
                tx.execute(
                    r#"INSERT INTO snapshot_ocr (
                        snapshot_id, session_id, captured_at_ms, ocr_text, ocr_meta, redacted,
                        status, error_hint, processed_at_ms
                    ) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9)
                    ON CONFLICT(snapshot_id) DO UPDATE SET
                        ocr_text = excluded.ocr_text,
                        ocr_meta = excluded.ocr_meta,
                        redacted = excluded.redacted,
                        status = excluded.status,
                        error_hint = excluded.error_hint,
                        processed_at_ms = excluded.processed_at_ms"#,
                    params![
                        r.snapshot_id,
                        r.session_id,
                        r.captured_at_ms,
                        r.ocr_text,
                        r.ocr_meta,
                        r.redacted,
                        r.status,
                        r.error_hint,
                        r.processed_at_ms,
                    ],
                )?;
                tx.execute(
                    "DELETE FROM snapshot_ocr_fts WHERE snapshot_id = ?1",
                    [&r.snapshot_id],
                )?;
                if let Some(ref body) = r.fts_body {
                    if !body.trim().is_empty() {
                        tx.execute(
                            r#"INSERT INTO snapshot_ocr_fts (snapshot_id, session_id, captured_at_ms, body)
                               VALUES (?1, ?2, ?3, ?4)"#,
                            params![r.snapshot_id, r.session_id, r.captured_at_ms, body],
                        )?;
                    }
                }
                if r.update_session_context {
                    tx.execute(
                        r#"INSERT INTO session_ocr_context (
                            session_id, summary_line, summary_source, updated_at_ms, empty_reason
                        ) VALUES (?1, ?2, ?3, ?4, ?5)
                        ON CONFLICT(session_id) DO UPDATE SET
                            summary_line = excluded.summary_line,
                            summary_source = excluded.summary_source,
                            updated_at_ms = excluded.updated_at_ms,
                            empty_reason = excluded.empty_reason"#,
                        params![
                            r.session_id,
                            r.session_summary_line,
                            r.session_summary_source,
                            r.processed_at_ms,
                            r.session_empty_reason,
                        ],
                    )?;
                }
            }
            WriteEvent::InputMetric(r) => {
                tx.execute(
                    r#"INSERT INTO input_metrics (
                        id, timestamp_ms, session_id, window_interval_secs,
                        keystrokes_count, kpm, delete_count, delete_ratio, shortcut_count,
                        copy_count, paste_count, undo_count, mouse_click_count, mouse_distance_px,
                        scroll_delta_total, scroll_direction_changes, typing_burst_count, longest_pause_ms
                    ) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12, ?13, ?14, ?15, ?16, ?17, ?18)"#,
                    params![
                        r.id,
                        r.timestamp_ms,
                        r.session_id,
                        r.window_interval_secs,
                        r.keystrokes_count,
                        r.kpm,
                        r.delete_count,
                        r.delete_ratio,
                        r.shortcut_count,
                        r.copy_count,
                        r.paste_count,
                        r.undo_count,
                        r.mouse_click_count,
                        r.mouse_distance_px,
                        r.scroll_delta_total,
                        r.scroll_direction_changes,
                        r.typing_burst_count,
                        r.longest_pause_ms,
                    ],
                )?;
            }
            WriteEvent::ClipboardFlow(r) => {
                tx.execute(
                    r#"INSERT INTO clipboard_flows (
                        id, timestamp_ms, action, app_name, bundle_id, content_type, content_length, flow_pair_id
                    ) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8)"#,
                    params![
                        r.id,
                        r.timestamp_ms,
                        r.action,
                        r.app_name,
                        r.bundle_id,
                        r.content_type,
                        r.content_length,
                        r.flow_pair_id,
                    ],
                )?;
            }
            WriteEvent::Notification(r) => {
                tx.execute(
                    r#"INSERT INTO notifications (
                        id, timestamp_ms, source_app, source_bundle_id, current_foreground_app,
                        user_responded, response_delay_ms, caused_switch
                    ) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8)"#,
                    params![
                        r.id,
                        r.timestamp_ms,
                        r.source_app,
                        r.source_bundle_id,
                        r.current_foreground_app,
                        r.user_responded,
                        r.response_delay_ms,
                        r.caused_switch,
                    ],
                )?;
            }
            WriteEvent::AmbientContext(r) => {
                tx.execute(
                    r#"INSERT INTO ambient_context (
                        id, timestamp_ms, wifi_ssid, display_count, is_external_display,
                        battery_level, is_charging, is_camera_active, is_audio_input_active,
                        is_dnd_enabled, screen_brightness, active_space_index
                    ) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12)"#,
                    params![
                        r.id,
                        r.timestamp_ms,
                        r.wifi_ssid,
                        r.display_count,
                        r.is_external_display,
                        r.battery_level,
                        r.is_charging,
                        r.is_camera_active,
                        r.is_audio_input_active,
                        r.is_dnd_enabled,
                        r.screen_brightness,
                        r.active_space_index,
                    ],
                )?;
            }
            WriteEvent::NudgeLog(r) => {
                tx.execute(
                    r#"INSERT INTO nudge_log (
                        id, timestamp_ms, nudge_type, payload_json, dismissed
                    ) VALUES (?1, ?2, ?3, ?4, ?5)"#,
                    params![
                        r.id,
                        r.timestamp_ms,
                        r.nudge_type,
                        r.payload_json,
                        r.dismissed,
                    ],
                )?;
            }
            WriteEvent::WalCheckpoint => {
                let _ = super::storage::db::wal_checkpoint(&*tx);
            }
            WriteEvent::Retention {
                raw_cutoff_ms,
                snapshot_cutoff_ms,
            } => {
                tx.execute(
                    "DELETE FROM raw_events WHERE timestamp_ms < ?1",
                    [raw_cutoff_ms],
                )?;
                let mut stmt = tx.prepare(
                    "SELECT id, file_path FROM snapshots WHERE captured_at_ms < ?1 AND file_path != ''",
                )?;
                let paths: Vec<(String, String)> = stmt
                    .query_map([snapshot_cutoff_ms], |r| Ok((r.get(0)?, r.get(1)?)))?
                    .filter_map(|x| x.ok())
                    .collect();
                drop(stmt);
                for (_, fp) in &paths {
                    let _ = std::fs::remove_file(fp);
                }
                tx.execute(
                    "UPDATE snapshots SET file_path = '' WHERE captured_at_ms < ?1",
                    [snapshot_cutoff_ms],
                )?;
            }
            WriteEvent::SessionUpdate(op) => match op {
                SessionUpdateOp::DeactivateAll => {
                    tx.execute("UPDATE window_sessions SET is_active = 0", [])?;
                }
                SessionUpdateOp::Insert {
                    id,
                    start_ms,
                    end_ms,
                    duration_ms,
                    app_name,
                    bundle_id,
                    window_title,
                    extracted_url,
                    extracted_file_path,
                    intent,
                    raw_event_count,
                    is_active,
                } => {
                    tx.execute(
                        r#"INSERT INTO window_sessions (
                            id, start_ms, end_ms, duration_ms, app_name, bundle_id, window_title,
                            extracted_url, extracted_file_path, intent, raw_event_count, is_active
                        ) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12)"#,
                        params![
                            id,
                            start_ms,
                            end_ms,
                            duration_ms,
                            app_name,
                            bundle_id,
                            window_title,
                            extracted_url,
                            extracted_file_path,
                            intent,
                            raw_event_count,
                            is_active,
                        ],
                    )?;
                }
                SessionUpdateOp::Close {
                    id,
                    end_ms,
                    duration_ms,
                } => {
                    tx.execute(
                        "UPDATE window_sessions SET end_ms = ?2, duration_ms = ?3, is_active = 0 WHERE id = ?1",
                        params![id, end_ms, duration_ms],
                    )?;
                }
                SessionUpdateOp::BumpRawCount {
                    id,
                    end_ms,
                    duration_ms,
                    delta,
                } => {
                    tx.execute(
                        "UPDATE window_sessions SET end_ms = ?2, duration_ms = ?3, raw_event_count = raw_event_count + ?4 WHERE id = ?1",
                        params![id, end_ms, duration_ms, delta],
                    )?;
                }
            },
            WriteEvent::Shutdown => {}
        }
    }
    tx.commit()?;
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::core::models::{RawEventRow, SessionUpdateOp, SnapshotRow, WriteEvent};
    use crate::core::storage::migrations::run_migrations;
    use rusqlite::Connection;

    fn conn_with_schema() -> Connection {
        let mut c = Connection::open_in_memory().unwrap();
        run_migrations(&mut c).unwrap();
        c
    }

    fn sample_raw(id: &str, ts: i64) -> RawEventRow {
        RawEventRow {
            id: id.into(),
            timestamp_ms: ts,
            app_name: "TestApp".into(),
            bundle_id: Some("com.test.app".into()),
            window_title: "Window".into(),
            extracted_url: None,
            extracted_file_path: None,
            idle_seconds: 0.0,
            is_fullscreen: 0,
            is_audio_playing: 0,
            state_hash: 42,
            trigger_type: "poll".into(),
            created_at: ts,
        }
    }

    #[test]
    fn apply_batch_raw_inserts_row_and_app_meta() {
        let mut c = conn_with_schema();
        apply_batch(&mut c, &[WriteEvent::RawEvent(sample_raw("r1", 1_700_000_000_000))]).unwrap();
        let n: i64 = c
            .query_row("SELECT COUNT(*) FROM raw_events", [], |r| r.get(0))
            .unwrap();
        assert_eq!(n, 1);
        let meta: i64 = c
            .query_row(
                "SELECT COUNT(*) FROM app_meta WHERE app_name = 'TestApp'",
                [],
                |r| r.get(0),
            )
            .unwrap();
        assert_eq!(meta, 1);
    }

    #[test]
    fn apply_batch_session_insert_and_close() {
        let mut c = conn_with_schema();
        apply_batch(
            &mut c,
            &[WriteEvent::SessionUpdate(SessionUpdateOp::Insert {
                id: "sess1".into(),
                start_ms: 100,
                end_ms: 100,
                duration_ms: 0,
                app_name: "A".into(),
                bundle_id: None,
                window_title: "t".into(),
                extracted_url: None,
                extracted_file_path: None,
                intent: None,
                raw_event_count: 1,
                is_active: 1,
            })],
        )
        .unwrap();
        apply_batch(
            &mut c,
            &[WriteEvent::SessionUpdate(SessionUpdateOp::Close {
                id: "sess1".into(),
                end_ms: 200,
                duration_ms: 100,
            })],
        )
        .unwrap();
        let active: i64 = c
            .query_row(
                "SELECT is_active FROM window_sessions WHERE id = 'sess1'",
                [],
                |r| r.get(0),
            )
            .unwrap();
        assert_eq!(active, 0);
        let dur: i64 = c
            .query_row(
                "SELECT duration_ms FROM window_sessions WHERE id = 'sess1'",
                [],
                |r| r.get(0),
            )
            .unwrap();
        assert_eq!(dur, 100);
    }

    #[test]
    fn retention_removes_old_snapshot_file_and_clears_path() {
        let mut c = conn_with_schema();
        apply_batch(
            &mut c,
            &[WriteEvent::SessionUpdate(SessionUpdateOp::Insert {
                id: "sess_r".into(),
                start_ms: 1,
                end_ms: 1,
                duration_ms: 0,
                app_name: "A".into(),
                bundle_id: None,
                window_title: "t".into(),
                extracted_url: None,
                extracted_file_path: None,
                intent: None,
                raw_event_count: 0,
                is_active: 0,
            })],
        )
        .unwrap();
        let dir = tempfile::tempdir().unwrap();
        let fp = dir.path().join("shot.webp");
        std::fs::write(&fp, b"webp").unwrap();
        let fp_str = fp.to_string_lossy().into_owned();
        apply_batch(
            &mut c,
            &[WriteEvent::Snapshot(SnapshotRow {
                id: "snap_r".into(),
                session_id: "sess_r".into(),
                file_path: fp_str,
                captured_at_ms: 1_000,
                file_size_bytes: 4,
                trigger_type: "poll".into(),
                resolution: None,
                format: "webp".into(),
                perceptual_hash: None,
            })],
        )
        .unwrap();
        assert!(fp.exists());
        apply_batch(
            &mut c,
            &[WriteEvent::Retention {
                raw_cutoff_ms: 10_000,
                snapshot_cutoff_ms: 10_000,
            }],
        )
        .unwrap();
        assert!(!fp.exists(), "snapshot file should be deleted");
        let path: String = c
            .query_row(
                "SELECT file_path FROM snapshots WHERE id = 'snap_r'",
                [],
                |r| r.get(0),
            )
            .unwrap();
        assert!(path.is_empty());
    }

    #[test]
    fn writer_thread_shutdown_persists_queued_raw() {
        let dir = tempfile::tempdir().unwrap();
        let db_path = dir.path().join("w.sqlite");
        let conn = crate::core::storage::db::open_write(&db_path).unwrap();
        let metrics = Arc::new(WriterMetrics::default());
        let h = spawn_writer_thread(conn, metrics);
        h.try_send(WriteEvent::RawEvent(sample_raw("thr1", 2_000_000_000_000)))
            .expect("send raw");
        h.try_send(WriteEvent::Shutdown).expect("send shutdown");
        std::thread::sleep(std::time::Duration::from_millis(300));
        let read = rusqlite::Connection::open(&db_path).unwrap();
        let n: i64 = read
            .query_row(
                "SELECT COUNT(*) FROM raw_events WHERE id = 'thr1'",
                [],
                |r| r.get(0),
            )
            .unwrap();
        assert_eq!(n, 1);
    }
}
