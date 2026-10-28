use crate::model::{now, Defaults, Document};
use atomic_write_file::AtomicWriteFile;
use std::{fs, io::Write, path::PathBuf};

pub struct Store {
    path: PathBuf,
}

impl Store {
    pub fn new(directory: PathBuf) -> Result<Self, String> {
        fs::create_dir_all(&directory).map_err(|e| e.to_string())?;
        Ok(Self { path: directory.join("state.json") })
    }

    pub fn load(&self, defaults: &Defaults) -> Result<Document, String> {
        match fs::read(&self.path) {
            Ok(bytes) => {
                let document: Document = serde_json::from_slice(&bytes)
                    .map_err(|e| format!("设置文件无法读取，原文件已保留：{e}"))?;
                document.settings.validate()?;
                Ok(document)
            }
            Err(e) if e.kind() == std::io::ErrorKind::NotFound => Ok(Document {
                settings: defaults.settings.clone(), lifetime_items: 0, cleanup_runs: 0,
                last_cleanup_at: None, cycle_started_at: now(), history: Vec::new(),
            }),
            Err(e) => Err(e.to_string()),
        }
    }

    pub fn save(&self, document: &Document) -> Result<(), String> {
        let bytes = serde_json::to_vec_pretty(document).map_err(|e| e.to_string())?;
        let mut file = AtomicWriteFile::open(&self.path).map_err(|e| e.to_string())?;
        file.write_all(&bytes).map_err(|e| e.to_string())?;
        file.commit().map_err(|e| e.to_string())
    }
}
