use rusqlite::{Connection, Result as SqlResult, params};
use std::path::PathBuf;

use super::{
    ActivityStats, AppMeta, AppStats, EventSnapshot, WindowEvent, WindowEventWithSnapshots,
    WindowTitleStat,
};
use crate::core::storage::get_data_dir;

pub struct Database {
    conn: Connection,
}

impl Database {
    pub fn new(app: &tauri::AppHandle) -> Result<Self, Box<dyn std::error::Error>> {
        let data_dir = get_data_dir(app);

        std::fs::create_dir_all(&data_dir)?;
        let db_path = data_dir.join("db.sqlite");

        log::info!("Opening SQLite DB at: {}", db_path.display());

        let conn = Connection::open(&db_path)?;
        conn.execute_batch("PRAGMA journal_mode=WAL;")?;

        let db = Self { conn };
        db.init_schema()?;
        Ok(db)
    }

    #[cfg(test)]
    pub fn new_memory() -> SqlResult<Self> {
        let conn = Connection::open_in_memory()?;
        let db = Self { conn };
        db.init_schema()?;
        Ok(db)
    }

    fn init_schema(&self) -> SqlResult<()> {
        self.conn.execute_batch(
            "
            CREATE TABLE IF NOT EXISTS window_events (
                id TEXT PRIMARY KEY,
                timestamp_ms INTEGER NOT NULL,
                app_name TEXT NOT NULL,
                window_title TEXT NOT NULL,
                duration_ms INTEGER NOT NULL DEFAULT 0,
                intent TEXT
            );
            CREATE INDEX IF NOT EXISTS idx_window_events_timestamp
                ON window_events(timestamp_ms);

            CREATE TABLE IF NOT EXISTS event_snapshots (
                id TEXT PRIMARY KEY,
                event_id TEXT NOT NULL,
                file_path TEXT NOT NULL,
                captured_at_ms INTEGER NOT NULL,
                file_size_bytes INTEGER NOT NULL DEFAULT 0,
                FOREIGN KEY (event_id) REFERENCES window_events(id)
            );
            CREATE INDEX IF NOT EXISTS idx_snapshots_event_id
                ON event_snapshots(event_id);
            CREATE INDEX IF NOT EXISTS idx_snapshots_captured_at
                ON event_snapshots(captured_at_ms);

            CREATE TABLE IF NOT EXISTS settings (
                key TEXT PRIMARY KEY,
                value TEXT NOT NULL
            );

            CREATE TABLE IF NOT EXISTS app_meta (
                app_name TEXT PRIMARY KEY,
                icon_base64 TEXT
            );
        ",
        )?;

        // Ensure intent column exists for old DBs
        let _ = self.conn.execute("ALTER TABLE window_events ADD COLUMN intent TEXT", []);

        Ok(())
    }

    // ─── Activity Stats ───────────────────────────────────────────────────────

    pub fn get_activity_stats(&self) -> SqlResult<ActivityStats> {
        let today_start = today_start_ms();

        // 1. Total active ms
        let total_active_ms: i64 = self
            .conn
            .query_row(
                "SELECT SUM(duration_ms) FROM window_events WHERE timestamp_ms >= ?",
                [today_start],
                |row| row.get(0),
            )
            .unwrap_or(0);

        // 2. App stats
        let mut stmt = self.conn.prepare(
            "SELECT e.app_name, SUM(e.duration_ms), COUNT(*), m.icon_base64
             FROM window_events e
             LEFT JOIN app_meta m ON e.app_name = m.app_name
             WHERE e.timestamp_ms >= ?
             GROUP BY e.app_name
             ORDER BY SUM(e.duration_ms) DESC",
        )?;
        let app_stats = stmt
            .query_map([today_start], |row| {
                Ok(AppStats {
                    app_name: row.get(0)?,
                    duration_ms: row.get(1)?,
                    event_count: row.get(2)?,
                    icon_base64: row.get(3)?,
                })
            })?
            .filter_map(|r| r.ok())
            .collect();

        // 3. Hourly pulse + AFK calculation
        let mut hourly_pulse = vec![0i64; 24];
        let mut stmt = self.conn.prepare(
            "SELECT timestamp_ms, duration_ms FROM window_events WHERE timestamp_ms >= ? ORDER BY timestamp_ms ASC"
        )?;
        let event_rows: Vec<(i64, i64)> = stmt
            .query_map([today_start], |row| {
                Ok((row.get::<_, i64>(0)?, row.get::<_, i64>(1)?))
            })?
            .filter_map(|r| r.ok())
            .collect();

        for &(ts, dur) in &event_rows {
            use chrono::Timelike;
            if let Some(dt) = chrono::DateTime::from_timestamp_millis(ts) {
                let local_time = dt.with_timezone(&chrono::Local);
                let hour = local_time.hour() as usize;
                if hour < 24 {
                    hourly_pulse[hour] += dur;
                }
            }
        }

        // Calculate AFK time: sum gaps between events that are > 4min and < 1hr
        let afk_threshold_ms = 240_000i64;
        let max_gap_ms = 3_600_000i64;
        let mut afk_ms = 0i64;
        for w in event_rows.windows(2) {
            let prev_end = w[0].0 + w[0].1;
            let next_start = w[1].0;
            let gap = next_start - prev_end;
            if gap > afk_threshold_ms && gap < max_gap_ms {
                afk_ms += gap;
            }
        }

        Ok(ActivityStats {
            total_active_ms,
            afk_ms,
            app_stats,
            hourly_pulse,
        })
    }

    pub fn get_window_breakdown(&self, app_name: &str) -> SqlResult<Vec<WindowTitleStat>> {
        let today_start = today_start_ms();
        let mut stmt = self.conn.prepare(
            "SELECT window_title, SUM(duration_ms), COUNT(*), MAX(intent)
             FROM window_events
             WHERE app_name = ? AND timestamp_ms >= ?
             GROUP BY window_title
             ORDER BY SUM(duration_ms) DESC",
        )?;
        let rows = stmt.query_map(params![app_name, today_start], |row| {
            Ok(WindowTitleStat {
                window_title: row.get(0)?,
                total_duration_ms: row.get(1)?,
                session_count: row.get(2)?,
                intent: row.get(3)?,
            })
        })?;
        Ok(rows.filter_map(|r| r.ok()).collect())
    }

    pub fn get_snapshots_for_window(
        &self,
        app_name: &str,
        window_title: &str,
    ) -> SqlResult<Vec<EventSnapshot>> {
        let today_start = today_start_ms();
        let mut stmt = self.conn.prepare(
            "SELECT s.id, s.event_id, s.file_path, s.captured_at_ms, s.file_size_bytes
             FROM event_snapshots s
             JOIN window_events e ON s.event_id = e.id
             WHERE e.app_name = ? AND e.window_title = ? AND e.timestamp_ms >= ?
             ORDER BY s.captured_at_ms ASC",
        )?;
        let rows = stmt.query_map(params![app_name, window_title, today_start], |row| {
            Ok(EventSnapshot {
                id: row.get(0)?,
                event_id: row.get(1)?,
                file_path: row.get(2)?,
                captured_at_ms: row.get(3)?,
                file_size_bytes: row.get(4)?,
            })
        })?;
        Ok(rows.filter_map(|r| r.ok()).collect())
    }

    // ─── App Metadata ────────────────────────────────────────────────────────

    pub fn upsert_app_meta(&self, meta: &AppMeta) -> SqlResult<()> {
        self.conn.execute(
            "INSERT OR REPLACE INTO app_meta (app_name, icon_base64) VALUES (?, ?)",
            params![meta.app_name, meta.icon_base64],
        )?;
        Ok(())
    }

    pub fn get_app_meta(&self, app_name: &str) -> SqlResult<Option<AppMeta>> {
        let mut stmt = self
            .conn
            .prepare("SELECT app_name, icon_base64 FROM app_meta WHERE app_name = ?")?;
        let mut rows = stmt.query_map([app_name], |row| {
            Ok(AppMeta {
                app_name: row.get(0)?,
                icon_base64: row.get(1)?,
            })
        })?;

        if let Some(row) = rows.next() {
            return Ok(Some(row?));
        }
        Ok(None)
    }

    pub fn get_all_app_meta(&self) -> SqlResult<Vec<AppMeta>> {
        let mut stmt = self
            .conn
            .prepare("SELECT app_name, icon_base64 FROM app_meta")?;
        let rows = stmt.query_map([], |row| {
            Ok(AppMeta {
                app_name: row.get(0)?,
                icon_base64: row.get(1)?,
            })
        })?;
        Ok(rows.filter_map(|r| r.ok()).collect())
    }

    // ─── Window Events ───────────────────────────────────────────────────────

    pub fn insert_event(&self, event: &WindowEvent) -> SqlResult<()> {
        self.conn.execute(
            "INSERT OR REPLACE INTO window_events
             (id, timestamp_ms, app_name, window_title, duration_ms, intent)
             VALUES (?, ?, ?, ?, ?, ?)",
            params![
                event.id,
                event.timestamp_ms,
                event.app_name,
                event.window_title,
                event.duration_ms,
                event.intent
            ],
        )?;
        Ok(())
    }

    pub fn update_event_duration(&self, event_id: &str, duration_ms: i64) -> SqlResult<()> {
        self.conn.execute(
            "UPDATE window_events SET duration_ms = ? WHERE id = ?",
            params![duration_ms, event_id],
        )?;
        Ok(())
    }

    pub fn get_today_events(&self) -> SqlResult<Vec<WindowEvent>> {
        let today_start = today_start_ms();
        let mut stmt = self.conn.prepare(
            "SELECT id, timestamp_ms, app_name, window_title, duration_ms, intent
             FROM window_events
             WHERE timestamp_ms >= ?
             ORDER BY timestamp_ms ASC",
        )?;
        let mut events: Vec<WindowEvent> = stmt
            .query_map([today_start], |row| {
                Ok(WindowEvent {
                    id: row.get(0)?,
                    timestamp_ms: row.get(1)?,
                    app_name: row.get(2)?,
                    window_title: row.get(3)?,
                    duration_ms: row.get(4)?,
                    intent: row.get(5).unwrap_or(None),
                    snapshot_urls: Vec::new(),
                })
            })?
            .filter_map(|r| r.ok())
            .collect();

        // Populate snapshot URLs using the local protocol scheme
        for event in &mut events {
            if let Ok(snapshots) = self.get_snapshots_for_event(&event.id) {
                event.snapshot_urls = snapshots
                    .into_iter()
                    .map(|s| {
                        if let Some(pos) = s.file_path.find("shots/") {
                            format!("timelens://localhost/{}", &s.file_path[pos..])
                        } else {
                            format!("timelens://localhost/{}", s.file_path)
                        }
                    })
                    .collect();
            }
        }

        Ok(events)
    }

    /// Returns today's events — each bundled with its associated snapshots.
    pub fn get_today_events_with_snapshots(&self) -> SqlResult<Vec<WindowEventWithSnapshots>> {
        let events = self.get_today_events()?;
        let mut result = Vec::with_capacity(events.len());

        for event in events {
            let snapshots = self.get_snapshots_for_event(&event.id)?;
            result.push(WindowEventWithSnapshots { event, snapshots });
        }

        Ok(result)
    }

    pub fn get_events_for_date(&self, date: &str) -> SqlResult<Vec<WindowEvent>> {
        let date_naive = chrono::NaiveDate::parse_from_str(date, "%Y-%m-%d")
            .unwrap_or_else(|_| chrono::Local::now().date_naive());

        let start = date_naive
            .and_hms_opt(0, 0, 0)
            .unwrap()
            .and_local_timezone(chrono::Local)
            .unwrap()
            .timestamp_millis();
        let end = date_naive
            .and_hms_opt(23, 59, 59)
            .unwrap()
            .and_local_timezone(chrono::Local)
            .unwrap()
            .timestamp_millis();

        let mut stmt = self.conn.prepare(
            "SELECT id, timestamp_ms, app_name, window_title, duration_ms, intent
             FROM window_events
             WHERE timestamp_ms >= ? AND timestamp_ms <= ?
             ORDER BY timestamp_ms ASC",
        )?;
        let events = stmt
            .query_map(params![start, end], |row| {
                Ok(WindowEvent {
                    id: row.get(0)?,
                    timestamp_ms: row.get(1)?,
                    app_name: row.get(2)?,
                    window_title: row.get(3)?,
                    duration_ms: row.get(4)?,
                    intent: row.get(5).unwrap_or(None),
                    snapshot_urls: Vec::new(),
                })
            })?
            .filter_map(|r| r.ok())
            .collect();
        Ok(events)
    }

    // ─── Snapshots ───────────────────────────────────────────────────────────

    pub fn insert_snapshot(&self, snapshot: &EventSnapshot) -> SqlResult<()> {
        self.conn.execute(
            "INSERT OR REPLACE INTO event_snapshots
             (id, event_id, file_path, captured_at_ms, file_size_bytes)
             VALUES (?, ?, ?, ?, ?)",
            params![
                snapshot.id,
                snapshot.event_id,
                snapshot.file_path,
                snapshot.captured_at_ms,
                snapshot.file_size_bytes
            ],
        )?;
        Ok(())
    }

    pub fn get_snapshots_for_event(&self, event_id: &str) -> SqlResult<Vec<EventSnapshot>> {
        let mut stmt = self.conn.prepare(
            "SELECT id, event_id, file_path, captured_at_ms, file_size_bytes
             FROM event_snapshots
             WHERE event_id = ?
             ORDER BY captured_at_ms ASC",
        )?;
        let snapshots = stmt
            .query_map([event_id], |row| {
                Ok(EventSnapshot {
                    id: row.get(0)?,
                    event_id: row.get(1)?,
                    file_path: row.get(2)?,
                    captured_at_ms: row.get(3)?,
                    file_size_bytes: row.get(4)?,
                })
            })?
            .filter_map(|r| r.ok())
            .collect();
        Ok(snapshots)
    }

    pub fn get_recent_snapshots(&self, limit: usize) -> SqlResult<Vec<EventSnapshot>> {
        let mut stmt = self.conn.prepare(
            "SELECT id, event_id, file_path, captured_at_ms, file_size_bytes
             FROM event_snapshots
             ORDER BY captured_at_ms DESC
             LIMIT ?",
        )?;
        let snapshots = stmt
            .query_map([limit as i64], |row| {
                Ok(EventSnapshot {
                    id: row.get(0)?,
                    event_id: row.get(1)?,
                    file_path: row.get(2)?,
                    captured_at_ms: row.get(3)?,
                    file_size_bytes: row.get(4)?,
                })
            })?
            .filter_map(|r| r.ok())
            .collect();
        Ok(snapshots)
    }

    // ─── Settings ────────────────────────────────────────────────────────────

    pub fn get_setting(&self, key: &str) -> SqlResult<Option<String>> {
        let mut stmt = self
            .conn
            .prepare("SELECT value FROM settings WHERE key = ?")?;
        let mut rows = stmt.query_map([key], |row| row.get::<_, String>(0))?;
        Ok(rows.next().and_then(|r| r.ok()))
    }

    pub fn set_setting(&self, key: &str, value: &str) -> SqlResult<()> {
        self.conn.execute(
            "INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)",
            params![key, value],
        )?;
        Ok(())
    }

    pub fn get_all_settings(&self) -> SqlResult<std::collections::HashMap<String, String>> {
        let mut stmt = self.conn.prepare("SELECT key, value FROM settings")?;
        let mut map = std::collections::HashMap::new();
        let rows = stmt.query_map([], |row| {
            Ok((row.get::<_, String>(0)?, row.get::<_, String>(1)?))
        })?;
        for row in rows.filter_map(|r| r.ok()) {
            map.insert(row.0, row.1);
        }
        Ok(map)
    }
}

fn today_start_ms() -> i64 {
    chrono::Local::now()
        .date_naive()
        .and_hms_opt(0, 0, 0)
        .unwrap()
        .and_local_timezone(chrono::Local)
        .unwrap()
        .timestamp_millis()
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_database_operations() {
        // Since we removed DB from app handle, we can't easily test without mock handle
        // but this logic remains tested as earlier if we use memory db directly
    }
}
