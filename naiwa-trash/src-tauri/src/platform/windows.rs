use crate::model::{now, TrashSnapshot};
use std::{mem::size_of, process::Command, ptr};
use std::{os::windows::ffi::OsStrExt, path::Path};
use windows::{core::PCWSTR, Win32::{
    System::Com::{CoCreateInstance, CoInitializeEx, CoUninitialize, CLSCTX_INPROC_SERVER, COINIT_APARTMENTTHREADED},
    UI::Shell::{FileOperation, IFileOperation, IShellItem, SHCreateItemFromParsingName,
        FOF_NO_UI, FOFX_RECYCLEONDELETE, FOFX_ADDUNDORECORD, FOFX_EARLYFAILURE},
}};
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

struct ComApartment;
impl Drop for ComApartment {
    fn drop(&mut self) { unsafe { CoUninitialize(); } }
}

pub fn recycle(path: &Path) -> Result<(), String> {
    let wide: Vec<u16> = path.as_os_str().encode_wide().chain(std::iter::once(0)).collect();
    // Recycle-only Shell semantics: unavailable Recycle Bin is an error, not a permanent delete.
    unsafe {
        CoInitializeEx(None, COINIT_APARTMENTTHREADED).ok().map_err(|e| e.to_string())?;
        let _apartment = ComApartment;
        let operation: IFileOperation = CoCreateInstance(&FileOperation, None, CLSCTX_INPROC_SERVER)
            .map_err(|e| e.to_string())?;
        operation.SetOperationFlags(FOF_NO_UI | FOFX_RECYCLEONDELETE | FOFX_ADDUNDORECORD | FOFX_EARLYFAILURE)
            .map_err(|e| e.to_string())?;
        let item: IShellItem = SHCreateItemFromParsingName(PCWSTR(wide.as_ptr()), None)
            .map_err(|e| e.to_string())?;
        operation.DeleteItem(&item, None).map_err(|e| e.to_string())?;
        operation.PerformOperations().map_err(|e| e.to_string())?;
        if operation.GetAnyOperationsAborted().map_err(|e| e.to_string())?.as_bool() {
            return Err("系统未能把该项目移入回收站。".into());
        }
    }
    Ok(())
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
