use crate::core::storage::db::Database;
use crate::core::storage::{ActivityStats, WindowTitleStat};
use rusqlite::Result as SqlResult;

pub struct AnalysisService<'a> {
    db: &'a Database,
}

impl<'a> AnalysisService<'a> {
    pub fn new(db: &'a Database) -> Self {
        Self { db }
    }

    pub fn get_activity_stats(&self) -> SqlResult<ActivityStats> {
        self.db.get_activity_stats()
    }

    pub fn get_window_breakdown(&self, app_name: &str) -> SqlResult<Vec<WindowTitleStat>> {
        self.db.get_window_breakdown(app_name)
    }
}
