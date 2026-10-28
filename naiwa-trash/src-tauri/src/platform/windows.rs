use crate::model::{now, TrashSnapshot};
use std::{mem::size_of, process::Command, ptr};
use windows_sys::Win32::UI::Shell::{
    SHEmptyRecycleBinW, SHQueryRecycleBinW, SHQUERYRBINFO,
    SHERB_NOCONFIRMATION, SHERB_NOPROGRESSUI, SHERB_NOSOUND,
};

pub fn snapshot() -> Result<TrashSnapshot, String> {
    let mut info = SHQUERYRBINFO {
        cbSize: size_of::<SHQUERYRBINFO>() as u32, i64Size: 0, i64NumItems: 0,
    };
    // A null root asks the Shell for this user's combined Recycle Bin.
    let result = unsafe { SHQueryRecycleBinW(ptr::null(), &mut info) };
    if result < 0 { return Err(format!("读取系统回收站失败（HRESULT {result:#x}）。")); }
    Ok(TrashSnapshot {
        items: info.i64NumItems.max(0) as u64, bytes: Some(info.i64Size.max(0) as u64),
        measured_at: now(), detail: None,
    })
}

pub fn empty_all() -> Result<(), String> {
    let result = unsafe {
        SHEmptyRecycleBinW(ptr::null_mut(), ptr::null(),
            SHERB_NOCONFIRMATION | SHERB_NOPROGRESSUI | SHERB_NOSOUND)
    };
    if result < 0 { return Err(format!("清空系统回收站失败（HRESULT {result:#x}）。")); }
    Ok(())
}

pub fn open_trash() -> Result<(), String> {
    Command::new("explorer.exe").arg("shell:RecycleBinFolder")
        .spawn().map_err(|e| e.to_string())?;
    Ok(())
}
