use std::path::Path;
use std::sync::Arc;

use parking_lot::Mutex;
use rusqlite::{Connection, OpenFlags};

use super::migrations::run_migrations;

pub fn open_write(path: &Path) -> rusqlite::Result<Connection> {
    let mut conn = Connection::open(path)?;
    conn.execute_batch(
        r#"
        PRAGMA journal_mode = WAL;
        PRAGMA synchronous = NORMAL;
        PRAGMA cache_size = -8000;
        PRAGMA foreign_keys = ON;
    "#,
    )?;
    run_migrations(&mut conn)?;
    Ok(conn)
}

pub fn open_read(path: &Path) -> rusqlite::Result<Arc<Mutex<Connection>>> {
    let flags = OpenFlags::SQLITE_OPEN_READ_ONLY
        | OpenFlags::SQLITE_OPEN_URI
        | OpenFlags::SQLITE_OPEN_NO_MUTEX;
    let uri = format!("file:{}?mode=ro", path.display());
    let conn = Connection::open_with_flags(&uri, flags)?;
    conn.execute_batch(
        r#"
        PRAGMA cache_size = -8000;
    "#,
    )?;
    Ok(Arc::new(Mutex::new(conn)))
}

pub fn wal_checkpoint(conn: &Connection) -> rusqlite::Result<()> {
    conn.query_row("PRAGMA wal_checkpoint(TRUNCATE);", [], |_r| Ok(()))
}

pub fn wal_size_bytes(path: &Path) -> u64 {
    let wal = path.with_extension("sqlite-wal");
    std::fs::metadata(&wal).map(|m| m.len()).unwrap_or(0)
}
