mod model;
mod platform;
mod service;
mod store;

use model::*;
use service::Service;
use std::{collections::HashMap, path::PathBuf, sync::{Arc, Mutex}, time::Duration};
use tauri::{AppHandle, DragDropEvent, Emitter, Manager, State, WebviewUrl, WebviewWindow, WebviewWindowBuilder};

struct DropGrant { paths: Vec<PathBuf>, issued_at: u64 }
struct AppState {
    service: Arc<Mutex<Service>>,
    drops: Mutex<HashMap<String, DropGrant>>,
    runtime: RuntimeConfig,
}

#[derive(Clone, serde::Serialize)]
struct DropNotice { token: String, count: usize, x: f64, y: f64 }

fn only_window(window: &WebviewWindow, label: &str) -> Result<(), String> {
    if window.label() == label { Ok(()) } else { Err("此操作不适用于当前窗口。".into()) }
}

async fn operate<T, F>(app: AppHandle, service: Arc<Mutex<Service>>, action: F) -> Result<T, String>
where T: Send + 'static, F: FnOnce(&mut Service) -> Result<T, String> + Send + 'static {
    tauri::async_runtime::spawn_blocking(move || {
        let mut service = service.lock().map_err(|e| e.to_string())?;
        let result = action(&mut service);
        let _ = app.emit("state-changed", service.state());
        result
    }).await.map_err(|e| e.to_string())?
}

#[tauri::command]
async fn get_state(app: AppHandle, state: State<'_, AppState>) -> Result<AppSnapshot, String> {
    operate(app, state.service.clone(), |service| Ok(service.state())).await
}

#[tauri::command]
async fn refresh_trash(app: AppHandle, state: State<'_, AppState>) -> Result<AppSnapshot, String> {
    operate(app, state.service.clone(), |service| {
        let _ = service.refresh();
        Ok(service.state())
    }).await
}

#[tauri::command]
async fn save_settings(window: WebviewWindow, app: AppHandle, state: State<'_, AppState>,
    settings: Settings) -> Result<AppSnapshot, String> {
    only_window(&window, "settings")?;
    operate(app, state.service.clone(), move |service| service.settings(settings)).await
}

#[tauri::command]
async fn recycle_drop(window: WebviewWindow, app: AppHandle, state: State<'_, AppState>,
    token: String) -> Result<FeedReceipt, String> {
    only_window(&window, "pet")?;
    let grant = state.drops.lock().map_err(|e| e.to_string())?.remove(&token)
        .ok_or("这次文件拖放已失效，请重新拖入。")?;
    if now().saturating_sub(grant.issued_at) > state.runtime.drop_ttl_seconds {
        return Err("这次文件拖放已过期，请重新拖入。".into());
    }
    operate(app, state.service.clone(), move |service| Ok(service.feed(grant.paths))).await
}

#[tauri::command]
fn discard_drop(state: State<'_, AppState>, token: String) -> Result<(), String> {
    state.drops.lock().map_err(|e| e.to_string())?.remove(&token);
    Ok(())
}

#[tauri::command]
async fn clean_now(window: WebviewWindow, app: AppHandle, state: State<'_, AppState>) -> Result<CleanupReceipt, String> {
    only_window(&window, "settings")?;
    let receipt = operate(app.clone(), state.service.clone(),
        |service| service.cleanup("手动清理")).await?;
    if receipt.removed_items > 0 { let _ = app.emit_to("pet", "cleanup-complete", &receipt); }
    Ok(receipt)
}

#[tauri::command]
async fn open_trash() -> Result<(), String> {
    tauri::async_runtime::spawn_blocking(platform::open_trash).await.map_err(|e| e.to_string())?
}

#[tauri::command]
fn show_settings(app: AppHandle) -> Result<(), String> {
    if let Some(window) = app.get_webview_window("settings") {
        window.show().map_err(|e| e.to_string())?;
        return window.set_focus().map_err(|e| e.to_string());
    }
    WebviewWindowBuilder::new(&app, "settings", WebviewUrl::App("settings.html".into()))
        .title("奶蛙回收站 · 设置").inner_size(500.0, 560.0)
        .resizable(false).build().map_err(|e| e.to_string())?;
    Ok(())
}

#[tauri::command]
fn exit_app(app: AppHandle) { app.exit(0); }

fn monitor(app: AppHandle, service: Arc<Mutex<Service>>, seconds: u64) {
    std::thread::spawn(move || loop {
        std::thread::sleep(Duration::from_secs(seconds));
        let Ok(mut service) = service.lock() else { break };
        let result = service.tick();
        let _ = app.emit("state-changed", service.state());
        match result {
            Some(Ok(receipt)) if receipt.removed_items > 0 => {
                let _ = app.emit_to("pet", "cleanup-complete", receipt);
            }
            Some(Err(error)) => { let _ = app.emit_to("pet", "operation-error", error); }
            _ => {}
        }
    });
}

pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_single_instance::init(|app, _, _| {
            if let Some(window) = app.get_webview_window("pet") {
                let _ = window.show();
                let _ = window.set_focus();
            }
        }))
        .plugin(tauri_plugin_window_state::Builder::default()
            .with_state_flags(tauri_plugin_window_state::StateFlags::POSITION).build())
        .setup(|app| {
            let defaults: Defaults = serde_json::from_str(include_str!("../../config/defaults.json"))?;
            defaults.settings.validate().map_err(std::io::Error::other)?;
            let runtime = defaults.runtime.clone();
            let store = store::Store::new(app.path().app_data_dir()?).map_err(std::io::Error::other)?;
            let service = Arc::new(Mutex::new(Service::new(store, defaults).map_err(std::io::Error::other)?));
            app.manage(AppState { service: service.clone(), drops: Mutex::new(HashMap::new()), runtime: runtime.clone() });
            use tauri::{menu::{Menu, MenuItem}, tray::TrayIconBuilder};
            let settings = MenuItem::with_id(app, "settings", "设置与清理", true, None::<&str>)?;
            let show = MenuItem::with_id(app, "show", "显示奶蛙", true, None::<&str>)?;
            let quit = MenuItem::with_id(app, "quit", "退出奶蛙", true, None::<&str>)?;
            let menu = Menu::with_items(app, &[&show, &settings, &quit])?;
            let mut tray = TrayIconBuilder::new().menu(&menu).tooltip("奶蛙回收站");
            if let Some(icon) = app.default_window_icon() { tray = tray.icon(icon.clone()); }
            tray.on_menu_event(|app, event| match event.id().as_ref() {
                "settings" => { let _ = show_settings(app.clone()); }
                "show" => { if let Some(window) = app.get_webview_window("pet") { let _ = window.show(); } }
                "quit" => app.exit(0),
                _ => {}
            }).build(app)?;
            monitor(app.handle().clone(), service, runtime.monitor_seconds);
            Ok(())
        })
        .on_window_event(|window, event| {
            if window.label() != "pet" { return; }
            if let tauri::WindowEvent::DragDrop(DragDropEvent::Drop { paths, position }) = event {
                let state = window.state::<AppState>();
                let Ok(mut grants) = state.drops.lock() else { return };
                grants.retain(|_, grant| now().saturating_sub(grant.issued_at) <= state.runtime.drop_ttl_seconds);
                if grants.len() >= state.runtime.max_pending_drops {
                    let _ = window.emit("operation-error", "还有太多文件在排队，请稍后再拖入。");
                    return;
                }
                let token = uuid::Uuid::new_v4().to_string();
                grants.insert(token.clone(), DropGrant { paths: paths.clone(), issued_at: now() });
                let _ = window.emit("files-dropped", DropNotice {
                    token, count: paths.len(), x: position.x, y: position.y,
                });
            }
        })
        .invoke_handler(tauri::generate_handler![
            get_state, refresh_trash, save_settings, recycle_drop, discard_drop,
            clean_now, open_trash, show_settings, exit_app
        ])
        .run(tauri::generate_context!())
        .expect("奶蛙回收站启动失败");
}
