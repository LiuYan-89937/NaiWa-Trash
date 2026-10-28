use std::path::Path;

#[cfg(target_os = "macos")]
mod macos;
#[cfg(target_os = "macos")]
pub use macos::{empty_all, open_trash, snapshot};

#[cfg(target_os = "windows")]
mod windows;
#[cfg(target_os = "windows")]
pub use windows::{empty_all, open_trash, snapshot};

#[cfg(not(any(target_os = "macos", target_os = "windows")))]
compile_error!("奶蛙回收站目前只支持 macOS 和 Windows。");

pub fn recycle(path: &Path) -> Result<(), String> {
    trash::delete(path).map_err(|e| e.to_string())
}
