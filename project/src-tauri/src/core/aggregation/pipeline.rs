use std::sync::{
    atomic::{AtomicBool, Ordering},
    mpsc::Receiver,
    Arc, RwLock,
};

use parking_lot::Mutex;
use std::time::Instant;

use chrono::Utc;
use rusqlite::Connection;
use log::warn;
use serde_json::json;
use tauri::{AppHandle, Emitter};
use uuid::Uuid;

use crate::core::intent_mapping::resolve_intent;
use crate::core::models::{
    AggregationCmd, SessionUpdateOp, WindowSession, WriteEvent,
};
use crate::core::writer::WriterHandle;

struct AggState {
    active_id: Option<String>,
    start_ms: i64,
    last_app: String,
    last_bundle: Option<String>,
}

impl Default for AggState {
    fn default() -> Self {
        Self {
            active_id: None,
            start_ms: 0,
            last_app: String::new(),
            last_bundle: None,
        }
    }
}

fn same_app(a: &str, ab: &Option<String>, b: &str, bb: &Option<String>) -> bool {
    match (ab.as_ref(), bb.as_ref()) {
        (Some(x), Some(y)) if x == y => true,
        (None, None) => a == b,
        _ => false,
    }
}

fn emit_session(app: &AppHandle, w: &WindowSession) {
    let _ = app.emit("window_event_updated", w);
}

fn insert_session(
    writer: &WriterHandle,
    id: &str,
    ts: i64,
    app_name: &str,
    bundle_id: &Option<String>,
    window_title: &str,
    extracted_url: &Option<String>,
    extracted_file_path: &Option<String>,
    intent: Option<String>,
) {
    let _ = writer.try_send(WriteEvent::SessionUpdate(SessionUpdateOp::Insert {
        id: id.to_string(),
        start_ms: ts,
        end_ms: ts,
        duration_ms: 0,
        app_name: app_name.to_string(),
        bundle_id: bundle_id.clone(),
        window_title: window_title.to_string(),
        extracted_url: extracted_url.clone(),
        extracted_file_path: extracted_file_path.clone(),
        intent,
        raw_event_count: 1,
        is_active: 1,
    }));
}

fn close_session(writer: &WriterHandle, id: &str, start_ms: i64, end_ms: i64) {
    let dur = (end_ms - start_ms).max(0);
    let _ = writer.try_send(WriteEvent::SessionUpdate(SessionUpdateOp::Close {
        id: id.to_string(),
        end_ms,
        duration_ms: dur,
    }));
}

fn window_session_from(
    id: &str,
    start_ms: i64,
    end_ms: i64,
    app_name: &str,
    bundle_id: &Option<String>,
    window_title: &str,
    extracted_url: &Option<String>,
    extracted_file_path: &Option<String>,
    intent: Option<String>,
    raw_count: i64,
    active: bool,
) -> WindowSession {
    WindowSession {
        id: id.to_string(),
        start_ms,
        end_ms,
        duration_ms: (end_ms - start_ms).max(0),
        app_name: app_name.to_string(),
        bundle_id: bundle_id.clone(),
        window_title: window_title.to_string(),
        extracted_url: extracted_url.clone(),
        extracted_file_path: extracted_file_path.clone(),
        intent,
        raw_event_count: raw_count,
        is_active: active,
    }
}

fn resolved_intent_for_insert(
    read_conn: &Mutex<Connection>,
    app_name: &str,
    bundle_id: &Option<String>,
) -> Option<String> {
    let g = read_conn.lock();
    resolve_intent(
        &g,
        app_name,
        bundle_id.as_deref(),
    )
    .unwrap_or(None)
}

fn handle_cmd(
    st: &mut AggState,
    cmd: AggregationCmd,
    writer: &WriterHandle,
    app: &AppHandle,
    current_session: &Arc<RwLock<Option<String>>>,
    is_afk: &Arc<AtomicBool>,
    read_conn: &Mutex<Connection>,
) {
    match cmd {
        AggregationCmd::Shutdown => {}
        AggregationCmd::EnterAfk { timestamp_ms, idle_seconds } => {
            if is_afk.load(Ordering::Relaxed) {
                return;
            }
            if let Some(ref id) = st.active_id {
                close_session(writer, id, st.start_ms, timestamp_ms);
            }
            let _ = writer.try_send(WriteEvent::SessionUpdate(SessionUpdateOp::DeactivateAll));
            st.active_id = None;
            *current_session.write().expect("lock") = None;
            is_afk.store(true, Ordering::Relaxed);
            let _ = app.emit(
                "afk_state_changed",
                json!({ "isAfk": true, "idleSeconds": idle_seconds }),
            );
        }
        AggregationCmd::ExitAfk {
            timestamp_ms,
            app_name,
            bundle_id,
            window_title,
            extracted_url,
            extracted_file_path,
            state_hash: _,
        } => {
            is_afk.store(false, Ordering::Relaxed);
            let _ = writer.try_send(WriteEvent::SessionUpdate(SessionUpdateOp::DeactivateAll));
            let new_id = Uuid::new_v4().to_string();
            let intent = resolved_intent_for_insert(read_conn, &app_name, &bundle_id);
            insert_session(
                writer,
                &new_id,
                timestamp_ms,
                &app_name,
                &bundle_id,
                &window_title,
                &extracted_url,
                &extracted_file_path,
                intent.clone(),
            );
            st.active_id = Some(new_id.clone());
            st.start_ms = timestamp_ms;
            st.last_app = app_name.clone();
            st.last_bundle = bundle_id.clone();
            *current_session.write().expect("lock") = Some(new_id.clone());
            let w = window_session_from(
                &new_id,
                timestamp_ms,
                timestamp_ms,
                &app_name,
                &bundle_id,
                &window_title,
                &extracted_url,
                &extracted_file_path,
                intent,
                1,
                true,
            );
            emit_session(app, &w);
            let _ = app.emit("afk_state_changed", json!({ "isAfk": false, "idleSeconds": 0.0 }));
        }
        AggregationCmd::EnterRecordingBlackout { timestamp_ms } => {
            if let Some(ref id) = st.active_id {
                close_session(writer, id, st.start_ms, timestamp_ms);
            }
            let _ = writer.try_send(WriteEvent::SessionUpdate(SessionUpdateOp::DeactivateAll));
            st.active_id = None;
            st.start_ms = 0;
            st.last_app.clear();
            st.last_bundle = None;
            *current_session.write().expect("lock") = None;
            is_afk.store(false, Ordering::Relaxed);
        }
        AggregationCmd::Tick {
            timestamp_ms,
            app_name,
            bundle_id,
            window_title,
            extracted_url,
            extracted_file_path,
            trigger_type,
            state_hash: _,
        } => {
            if is_afk.load(Ordering::Relaxed) {
                return;
            }
            match trigger_type.as_str() {
                "window_change" => {
                    if let Some(ref id) = st.active_id {
                        close_session(writer, id, st.start_ms, timestamp_ms);
                    }
                    let _ = writer.try_send(WriteEvent::SessionUpdate(SessionUpdateOp::DeactivateAll));
                    let new_id = Uuid::new_v4().to_string();
                    let intent = resolved_intent_for_insert(read_conn, &app_name, &bundle_id);
                    insert_session(
                        writer,
                        &new_id,
                        timestamp_ms,
                        &app_name,
                        &bundle_id,
                        &window_title,
                        &extracted_url,
                        &extracted_file_path,
                        intent.clone(),
                    );
                    st.active_id = Some(new_id.clone());
                    st.start_ms = timestamp_ms;
                    st.last_app = app_name.clone();
                    st.last_bundle = bundle_id.clone();
                    *current_session.write().expect("lock") = Some(new_id.clone());
                    let w = window_session_from(
                        &new_id,
                        timestamp_ms,
                        timestamp_ms,
                        &app_name,
                        &bundle_id,
                        &window_title,
                        &extracted_url,
                        &extracted_file_path,
                        intent,
                        1,
                        true,
                    );
                    emit_session(app, &w);
                }
                "poll" | "title_change" => {
                    if let Some(ref id) = st.active_id {
                        if same_app(
                            &st.last_app,
                            &st.last_bundle,
                            &app_name,
                            &bundle_id,
                        ) {
                            let end = timestamp_ms;
                            let dur = (end - st.start_ms).max(0);
                            let _ = writer.try_send(WriteEvent::SessionUpdate(
                                SessionUpdateOp::BumpRawCount {
                                    id: id.clone(),
                                    end_ms: end,
                                    duration_ms: dur,
                                    delta: 1,
                                },
                            ));
                            st.last_app = app_name.clone();
                            st.last_bundle = bundle_id.clone();
                        } else {
                            if let Some(ref oid) = st.active_id.clone() {
                                close_session(writer, oid, st.start_ms, timestamp_ms);
                            }
                            let _ =
                                writer.try_send(WriteEvent::SessionUpdate(SessionUpdateOp::DeactivateAll));
                            let new_id = Uuid::new_v4().to_string();
                            let intent = resolved_intent_for_insert(read_conn, &app_name, &bundle_id);
                            insert_session(
                                writer,
                                &new_id,
                                timestamp_ms,
                                &app_name,
                                &bundle_id,
                                &window_title,
                                &extracted_url,
                                &extracted_file_path,
                                intent.clone(),
                            );
                            st.active_id = Some(new_id.clone());
                            st.start_ms = timestamp_ms;
                            st.last_app = app_name.clone();
                            st.last_bundle = bundle_id.clone();
                            *current_session.write().expect("lock") = Some(new_id.clone());
                            let w = window_session_from(
                                &new_id,
                                timestamp_ms,
                                timestamp_ms,
                                &app_name,
                                &bundle_id,
                                &window_title,
                                &extracted_url,
                                &extracted_file_path,
                                intent,
                                1,
                                true,
                            );
                            emit_session(app, &w);
                        }
                    } else {
                        let new_id = Uuid::new_v4().to_string();
                        let intent = resolved_intent_for_insert(read_conn, &app_name, &bundle_id);
                        insert_session(
                            writer,
                            &new_id,
                            timestamp_ms,
                            &app_name,
                            &bundle_id,
                            &window_title,
                            &extracted_url,
                            &extracted_file_path,
                            intent.clone(),
                        );
                        st.active_id = Some(new_id.clone());
                        st.start_ms = timestamp_ms;
                        st.last_app = app_name.clone();
                        st.last_bundle = bundle_id.clone();
                        *current_session.write().expect("lock") = Some(new_id.clone());
                        let w = window_session_from(
                            &new_id,
                            timestamp_ms,
                            timestamp_ms,
                            &app_name,
                            &bundle_id,
                            &window_title,
                            &extracted_url,
                            &extracted_file_path,
                            intent,
                            1,
                            true,
                        );
                        emit_session(app, &w);
                    }
                }
                _ => {}
            }
        }
    }
}

fn compensate(
    read_conn: &Mutex<rusqlite::Connection>,
    writer: &WriterHandle,
    _app: &AppHandle,
    current_session: &Arc<RwLock<Option<String>>>,
    is_afk: &Arc<AtomicBool>,
    st: &mut AggState,
) {
    if is_afk.load(Ordering::Relaxed) {
        return;
    }
    let conn = read_conn.lock();
    let now = Utc::now().timestamp_millis();
    let stale_ms = 10 * 60 * 1000;
    let mut stmt = match conn.prepare(
        "SELECT id, start_ms, end_ms FROM window_sessions WHERE is_active = 1",
    ) {
        Ok(s) => s,
        Err(e) => {
            warn!("compensate prepare: {e}");
            return;
        }
    };
    let rows = match stmt.query_map([], |r| {
        Ok((r.get::<_, String>(0)?, r.get::<_, i64>(1)?, r.get::<_, i64>(2)?))
    }) {
        Ok(r) => r,
        Err(e) => {
            warn!("compensate query: {e}");
            return;
        }
    };
    for row in rows.flatten() {
        let (id, start, end) = row;
        if now - end > stale_ms {
            close_session(writer, &id, start, end);
            let _ = writer.try_send(WriteEvent::SessionUpdate(SessionUpdateOp::DeactivateAll));
            if st.active_id.as_ref() == Some(&id) {
                st.active_id = None;
                *current_session.write().expect("lock") = None;
            }
        }
    }
}

pub fn spawn_aggregation_thread(
    app: AppHandle,
    rx: Receiver<AggregationCmd>,
    writer: WriterHandle,
    read_conn: Arc<Mutex<rusqlite::Connection>>,
    current_session: Arc<RwLock<Option<String>>>,
    is_afk: Arc<AtomicBool>,
) {
    std::thread::spawn(move || {
        let mut st = AggState::default();
        let mut last_comp = Instant::now();
        loop {
            if last_comp.elapsed() >= std::time::Duration::from_secs(60) {
                compensate(
                    read_conn.as_ref(),
                    &writer,
                    &app,
                    &current_session,
                    &is_afk,
                    &mut st,
                );
                last_comp = Instant::now();
            }
            match rx.recv_timeout(std::time::Duration::from_millis(200)) {
                Ok(AggregationCmd::Shutdown) => break,
                Ok(cmd) => handle_cmd(
                    &mut st,
                    cmd,
                    &writer,
                    &app,
                    &current_session,
                    &is_afk,
                    read_conn.as_ref(),
                ),
                Err(std::sync::mpsc::RecvTimeoutError::Timeout) => {}
                Err(std::sync::mpsc::RecvTimeoutError::Disconnected) => break,
            }
        }
    });
}

#[cfg(test)]
mod tests {
    use super::same_app;

    #[test]
    fn same_app_matches_bundle_id() {
        assert!(same_app(
            "A",
            &Some("com.a".into()),
            "A",
            &Some("com.a".into())
        ));
        assert!(!same_app(
            "A",
            &Some("com.a".into()),
            "A",
            &Some("com.b".into())
        ));
    }

    #[test]
    fn same_app_falls_back_to_name_when_no_bundle() {
        assert!(same_app("X", &None, "X", &None));
        assert!(!same_app("X", &None, "Y", &None));
    }
}
