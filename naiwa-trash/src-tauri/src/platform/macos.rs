use crate::model::{now, TrashSnapshot};
use std::process::Command;
use url::Url;
use walkdir::WalkDir;

fn script(language: &str, source: &str) -> Result<String, String> {
    let output = Command::new("/usr/bin/osascript")
        .args(["-l", language, "-e", source]).output().map_err(|e| e.to_string())?;
    if !output.status.success() {
        return Err(String::from_utf8_lossy(&output.stderr).trim().to_string());
    }
    Ok(String::from_utf8_lossy(&output.stdout).trim().to_string())
}

pub fn snapshot() -> Result<TrashSnapshot, String> {
    // Finder exposes the current user's unified Trash across mounted volumes.
    // JSON preserves filenames containing newlines; no user text enters a script.
    let output = script("JavaScript",
        "JSON.stringify(Application('Finder').trash.items().map(function(item) { return item.url(); }))")?;
    let urls: Vec<String> = serde_json::from_str(&output).map_err(|e| e.to_string())?;
    let mut bytes = Some(0_u64);
    let mut detail = None;
    for item in &urls {
        let path = Url::parse(item).map_err(|e| e.to_string())?
            .to_file_path().map_err(|_| "Finder 返回了无效的本地文件地址。".to_string())?;
        for entry in WalkDir::new(path).follow_links(false) {
            let measurement = entry.map_err(|e| e.to_string()).and_then(|entry| {
                std::fs::symlink_metadata(entry.path()).map_err(|e| e.to_string())
            });
            match measurement {
                Ok(meta) if !meta.is_dir() => {
                    bytes = bytes.and_then(|total| total.checked_add(meta.len()));
                }
                Ok(_) => {}
                Err(error) => {
                    bytes = None;
                    detail = Some(format!("部分项目容量无法读取：{error}"));
                    break;
                }
            }
        }
    }
    Ok(TrashSnapshot { items: urls.len() as u64, bytes, measured_at: now(), detail })
}

pub fn empty_all() -> Result<(), String> {
    script("AppleScript", "with timeout of 600 seconds\ntell application \"Finder\" to empty trash\nend timeout")?;
    Ok(())
}

pub fn open_trash() -> Result<(), String> {
    script("AppleScript", "tell application \"Finder\"\nactivate\nopen trash\nend tell")?;
    Ok(())
}
