pub mod db;
pub mod migrations;

use std::path::PathBuf;

#[derive(Clone)]
pub struct DataPaths {
    pub root: PathBuf,
    pub data_dir: PathBuf,
    pub db_path: PathBuf,
    pub shots_dir: PathBuf,
    pub exports_dir: PathBuf,
}

impl DataPaths {
    pub fn new() -> Result<Self, std::io::Error> {
        let home = dirs::home_dir().ok_or_else(|| {
            std::io::Error::new(std::io::ErrorKind::NotFound, "no home directory")
        })?;
        let root = home.join(".timelens");
        let data_dir = root.join("data");
        let db_path = data_dir.join("db.sqlite");
        let shots_dir = data_dir.join("shots");
        let exports_dir = root.join("exports");
        Ok(Self {
            root,
            data_dir,
            db_path,
            shots_dir,
            exports_dir,
        })
    }

    pub fn ensure_dirs(&self) -> Result<(), std::io::Error> {
        use std::fs;
        fs::create_dir_all(&self.data_dir)?;
        fs::create_dir_all(&self.shots_dir)?;
        fs::create_dir_all(&self.exports_dir)?;
        #[cfg(unix)]
        {
            use std::os::unix::fs::PermissionsExt;
            let mode = fs::Permissions::from_mode(0o700);
            let _ = fs::set_permissions(&self.root, mode.clone());
            let _ = fs::set_permissions(&self.data_dir, mode);
        }
        Ok(())
    }
}
