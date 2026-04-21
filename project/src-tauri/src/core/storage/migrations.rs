use rusqlite::Connection;

pub struct Migration {
    pub version: i32,
    pub description: &'static str,
    pub sql: &'static str,
}

pub const MIGRATIONS: &[Migration] = &[Migration {
    version: 1,
    description: "P0 initial schema",
    sql: r#"
CREATE TABLE IF NOT EXISTS schema_migrations (
    version INTEGER PRIMARY KEY,
    description TEXT,
    applied_at INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS raw_events (
    id TEXT PRIMARY KEY,
    timestamp_ms INTEGER NOT NULL,
    app_name TEXT NOT NULL,
    bundle_id TEXT,
    window_title TEXT NOT NULL,
    extracted_url TEXT,
    extracted_file_path TEXT,
    idle_seconds REAL DEFAULT 0,
    is_fullscreen INTEGER DEFAULT 0,
    is_audio_playing INTEGER DEFAULT 0,
    state_hash INTEGER NOT NULL,
    trigger_type TEXT NOT NULL,
    created_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_raw_events_ts ON raw_events(timestamp_ms);
CREATE INDEX IF NOT EXISTS idx_raw_events_app ON raw_events(app_name);
CREATE INDEX IF NOT EXISTS idx_raw_events_trigger ON raw_events(trigger_type);

CREATE TABLE IF NOT EXISTS window_sessions (
    id TEXT PRIMARY KEY,
    start_ms INTEGER NOT NULL,
    end_ms INTEGER NOT NULL,
    duration_ms INTEGER NOT NULL,
    app_name TEXT NOT NULL,
    bundle_id TEXT,
    window_title TEXT NOT NULL,
    extracted_url TEXT,
    extracted_file_path TEXT,
    intent TEXT,
    raw_event_count INTEGER DEFAULT 0,
    is_active INTEGER DEFAULT 1
);
CREATE INDEX IF NOT EXISTS idx_sessions_start ON window_sessions(start_ms);
CREATE INDEX IF NOT EXISTS idx_sessions_app ON window_sessions(app_name);

CREATE TABLE IF NOT EXISTS snapshots (
    id TEXT PRIMARY KEY,
    session_id TEXT NOT NULL,
    file_path TEXT NOT NULL,
    captured_at_ms INTEGER NOT NULL,
    file_size_bytes INTEGER NOT NULL DEFAULT 0,
    trigger_type TEXT NOT NULL,
    resolution TEXT,
    format TEXT DEFAULT 'webp',
    perceptual_hash TEXT,
    FOREIGN KEY (session_id) REFERENCES window_sessions(id)
);
CREATE INDEX IF NOT EXISTS idx_snapshots_session ON snapshots(session_id);
CREATE INDEX IF NOT EXISTS idx_snapshots_time ON snapshots(captured_at_ms);

CREATE TABLE IF NOT EXISTS app_meta (
    app_name TEXT PRIMARY KEY,
    bundle_id TEXT,
    icon_base64 TEXT,
    category TEXT,
    first_seen_ms INTEGER,
    last_seen_ms INTEGER
);

CREATE TABLE IF NOT EXISTS app_switches (
    id TEXT PRIMARY KEY,
    timestamp_ms INTEGER NOT NULL,
    from_app TEXT NOT NULL,
    from_bundle_id TEXT,
    from_window_title TEXT,
    to_app TEXT NOT NULL,
    to_bundle_id TEXT,
    to_window_title TEXT,
    from_session_duration_ms INTEGER DEFAULT 0,
    switch_type TEXT DEFAULT 'voluntary'
);
CREATE INDEX IF NOT EXISTS idx_switches_ts ON app_switches(timestamp_ms);
CREATE INDEX IF NOT EXISTS idx_switches_from_app ON app_switches(from_app);
CREATE INDEX IF NOT EXISTS idx_switches_to_app ON app_switches(to_app);
"#,
},
    Migration {
        version: 2,
        description: "Phase 2: missing P0 tables + daily_analysis + daily_reports",
        sql: r#"
CREATE TABLE IF NOT EXISTS intent_mapping (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    match_pattern TEXT NOT NULL,
    match_field TEXT NOT NULL DEFAULT 'app_name',
    intent TEXT NOT NULL,
    priority INTEGER DEFAULT 0,
    is_builtin INTEGER DEFAULT 0
);

CREATE TABLE IF NOT EXISTS input_metrics (
    id TEXT PRIMARY KEY,
    timestamp_ms INTEGER NOT NULL,
    session_id TEXT,
    window_interval_secs REAL NOT NULL,
    keystrokes_count INTEGER DEFAULT 0,
    kpm REAL DEFAULT 0,
    delete_count INTEGER DEFAULT 0,
    delete_ratio REAL DEFAULT 0,
    shortcut_count INTEGER DEFAULT 0,
    copy_count INTEGER DEFAULT 0,
    paste_count INTEGER DEFAULT 0,
    undo_count INTEGER DEFAULT 0,
    mouse_click_count INTEGER DEFAULT 0,
    mouse_distance_px REAL DEFAULT 0,
    scroll_delta_total REAL DEFAULT 0,
    scroll_direction_changes INTEGER DEFAULT 0,
    typing_burst_count INTEGER DEFAULT 0,
    longest_pause_ms INTEGER DEFAULT 0,
    FOREIGN KEY (session_id) REFERENCES window_sessions(id)
);
CREATE INDEX IF NOT EXISTS idx_input_metrics_ts ON input_metrics(timestamp_ms);
CREATE INDEX IF NOT EXISTS idx_input_metrics_session ON input_metrics(session_id);

CREATE TABLE IF NOT EXISTS clipboard_flows (
    id TEXT PRIMARY KEY,
    timestamp_ms INTEGER NOT NULL,
    action TEXT NOT NULL,
    app_name TEXT NOT NULL,
    bundle_id TEXT,
    content_type TEXT,
    content_length INTEGER DEFAULT 0,
    flow_pair_id TEXT
);
CREATE INDEX IF NOT EXISTS idx_clipboard_ts ON clipboard_flows(timestamp_ms);
CREATE INDEX IF NOT EXISTS idx_clipboard_pair ON clipboard_flows(flow_pair_id);
CREATE INDEX IF NOT EXISTS idx_clipboard_app ON clipboard_flows(app_name);

CREATE TABLE IF NOT EXISTS notifications (
    id TEXT PRIMARY KEY,
    timestamp_ms INTEGER NOT NULL,
    source_app TEXT NOT NULL,
    source_bundle_id TEXT,
    current_foreground_app TEXT,
    user_responded INTEGER DEFAULT 0,
    response_delay_ms INTEGER,
    caused_switch INTEGER DEFAULT 0
);
CREATE INDEX IF NOT EXISTS idx_notif_ts ON notifications(timestamp_ms);
CREATE INDEX IF NOT EXISTS idx_notif_source_app ON notifications(source_app);

CREATE TABLE IF NOT EXISTS ambient_context (
    id TEXT PRIMARY KEY,
    timestamp_ms INTEGER NOT NULL,
    wifi_ssid TEXT,
    display_count INTEGER DEFAULT 1,
    is_external_display INTEGER DEFAULT 0,
    battery_level REAL,
    is_charging INTEGER,
    is_camera_active INTEGER DEFAULT 0,
    is_audio_input_active INTEGER DEFAULT 0,
    is_dnd_enabled INTEGER DEFAULT 0,
    screen_brightness REAL,
    active_space_index INTEGER
);
CREATE INDEX IF NOT EXISTS idx_ambient_ts ON ambient_context(timestamp_ms);

CREATE TABLE IF NOT EXISTS settings (
    key TEXT PRIMARY KEY,
    value TEXT NOT NULL,
    updated_at INTEGER
);

CREATE TABLE IF NOT EXISTS daily_analysis (
    id TEXT PRIMARY KEY,
    analysis_date TEXT NOT NULL UNIQUE,
    generated_at_ms INTEGER NOT NULL,
    version INTEGER NOT NULL DEFAULT 1,
    total_active_ms INTEGER,
    intent_breakdown TEXT,
    top_apps TEXT,
    total_switches INTEGER,
    switches_per_hour TEXT,
    top_switch_pairs TEXT,
    deep_work_segments TEXT,
    deep_work_total_ms INTEGER,
    fragmentation_pct REAL,
    notification_count INTEGER,
    top_interrupters TEXT,
    interrupts_in_deep INTEGER,
    avg_kpm REAL,
    kpm_by_hour TEXT,
    avg_delete_ratio REAL,
    flow_score_avg REAL,
    struggle_score_avg REAL,
    clipboard_pairs INTEGER,
    top_flows TEXT,
    scene_breakdown TEXT,
    data_sources TEXT,
    degraded_sections TEXT
);
CREATE INDEX IF NOT EXISTS idx_daily_date ON daily_analysis(analysis_date);

CREATE TABLE IF NOT EXISTS daily_reports (
    id TEXT PRIMARY KEY,
    analysis_id TEXT NOT NULL,
    report_date TEXT NOT NULL,
    generated_at_ms INTEGER NOT NULL,
    report_type TEXT NOT NULL,
    content_md TEXT NOT NULL,
    content_html TEXT,
    ai_model TEXT,
    ai_prompt_hash TEXT,
    FOREIGN KEY (analysis_id) REFERENCES daily_analysis(id)
);
CREATE INDEX IF NOT EXISTS idx_reports_date ON daily_reports(report_date);
CREATE INDEX IF NOT EXISTS idx_reports_analysis ON daily_reports(analysis_id);
"#,
    },
    Migration {
        version: 3,
        description: "Phase 2 OCR: snapshot_ocr, session_ocr_context, FTS5",
        sql: r#"
CREATE TABLE IF NOT EXISTS snapshot_ocr (
    snapshot_id TEXT PRIMARY KEY,
    session_id TEXT NOT NULL,
    captured_at_ms INTEGER NOT NULL,
    ocr_text TEXT,
    redacted INTEGER NOT NULL DEFAULT 0,
    status TEXT NOT NULL,
    error_hint TEXT,
    processed_at_ms INTEGER NOT NULL,
    FOREIGN KEY (snapshot_id) REFERENCES snapshots(id) ON DELETE CASCADE,
    FOREIGN KEY (session_id) REFERENCES window_sessions(id)
);
CREATE INDEX IF NOT EXISTS idx_snapshot_ocr_session ON snapshot_ocr(session_id);
CREATE INDEX IF NOT EXISTS idx_snapshot_ocr_time ON snapshot_ocr(captured_at_ms);

CREATE TABLE IF NOT EXISTS session_ocr_context (
    session_id TEXT PRIMARY KEY,
    summary_line TEXT,
    summary_source TEXT,
    updated_at_ms INTEGER NOT NULL,
    empty_reason TEXT,
    FOREIGN KEY (session_id) REFERENCES window_sessions(id)
);

CREATE VIRTUAL TABLE IF NOT EXISTS snapshot_ocr_fts USING fts5(
    snapshot_id UNINDEXED,
    session_id UNINDEXED,
    captured_at_ms UNINDEXED,
    body,
    tokenize = 'unicode61 remove_diacritics 0'
);
"#,
    },
    Migration {
        version: 4,
        description: "OCR quality: snapshot_ocr.ocr_meta JSON",
        sql: r#"
ALTER TABLE snapshot_ocr ADD COLUMN ocr_meta TEXT;
"#,
    },
    Migration {
        version: 5,
        description: "AI assistant history + autostart setting",
        sql: r#"
CREATE TABLE IF NOT EXISTS assistant_history (
    id TEXT PRIMARY KEY,
    role TEXT NOT NULL,
    content TEXT NOT NULL,
    context_snapshot TEXT,
    created_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_assistant_history_created_at ON assistant_history(created_at);
INSERT INTO settings (key, value, updated_at)
VALUES ('autostart_enabled', '0', strftime('%s','now') * 1000)
ON CONFLICT(key) DO NOTHING;
"#,
    },
];

fn current_version(conn: &Connection) -> rusqlite::Result<i32> {
    let exists: bool = conn.query_row(
        "SELECT EXISTS(SELECT 1 FROM sqlite_master WHERE type='table' AND name='schema_migrations')",
        [],
        |row| row.get(0),
    )?;
    if !exists {
        return Ok(0);
    }
    conn.query_row(
        "SELECT COALESCE(MAX(version), 0) FROM schema_migrations",
        [],
        |row| row.get(0),
    )
}

pub fn run_migrations(conn: &mut Connection) -> rusqlite::Result<()> {
    conn.execute_batch("PRAGMA foreign_keys = ON;")?;
    let current = current_version(conn)?;

    for m in MIGRATIONS {
        if m.version <= current {
            continue;
        }
        let tx = conn.transaction()?;
        tx.execute_batch(m.sql)?;
        let now = chrono::Utc::now().timestamp_millis();
        tx.execute(
            "INSERT INTO schema_migrations (version, description, applied_at) VALUES (?1, ?2, ?3)",
            rusqlite::params![m.version, m.description, now],
        )?;
        tx.commit()?;
    }
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;
    use rusqlite::Connection;

    #[test]
    fn migrations_run_twice_idempotent() {
        let mut c = Connection::open_in_memory().unwrap();
        run_migrations(&mut c).unwrap();
        run_migrations(&mut c).unwrap();
        let v: i32 = c
            .query_row(
                "SELECT COALESCE(MAX(version), 0) FROM schema_migrations",
                [],
                |r| r.get(0),
            )
            .unwrap();
        assert_eq!(v, 5);
        let tables: i64 = c
            .query_row(
                "SELECT COUNT(*) FROM sqlite_master WHERE type='table' AND name='daily_analysis'",
                [],
                |r| r.get(0),
            )
            .unwrap();
        assert_eq!(tables, 1);
    }
}
