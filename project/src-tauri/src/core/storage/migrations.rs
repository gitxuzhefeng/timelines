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
}];

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
        assert_eq!(v, 1);
        let tables: i64 = c
            .query_row(
                "SELECT COUNT(*) FROM sqlite_master WHERE type='table' AND name='raw_events'",
                [],
                |r| r.get(0),
            )
            .unwrap();
        assert_eq!(tables, 1);
    }
}
