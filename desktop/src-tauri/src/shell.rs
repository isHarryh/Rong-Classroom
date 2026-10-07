use std::sync::atomic::AtomicU64;
use std::sync::Mutex;
use std::thread;
use std::time::{Duration, Instant};

use serde::Serialize;
use tauri::menu::{CheckMenuItem, Menu, MenuItem};
use tauri::tray::{MouseButton, MouseButtonState, TrayIconBuilder, TrayIconEvent};
use tauri::{
    AppHandle, Manager, Monitor, PhysicalPosition, Position, Size, WebviewUrl, WindowEvent,
};
use tauri_plugin_autostart::ManagerExt as AutostartExt;

use crate::config::{self, Settings};
use crate::remote::{self, RemoteStatus};

pub const BUTTON_LABEL: &str = "button";
pub const PLATFORM_LABEL: &str = "platform";
pub const SHELL_LABEL: &str = "shell";
pub const BUTTON_SIZE: f64 = 56.0;
pub const EDGE: f64 = 56.0;

const REMOTE_IDLE_SECS: u64 = 60 * 60;

/// 应用级共享状态。
#[derive(Default)]
pub struct AppState {
    settings: Mutex<Settings>,
    pub remote_status: Mutex<RemoteStatus>,
    pub load_generation: AtomicU64,
    pub load_activity: Mutex<Option<Instant>>,
    destroy_at: Mutex<Option<Instant>>,
    button_move_at: Mutex<Option<Instant>>,
    pub board_file: Mutex<Option<String>>,
}

impl AppState {
    pub fn settings(&self) -> Settings {
        self.settings.lock().unwrap().clone()
    }

    pub fn settings_mut(&self) -> std::sync::MutexGuard<'_, Settings> {
        self.settings.lock().unwrap()
    }
}

pub fn setup(app: &AppHandle) -> tauri::Result<()> {
    let settings = config::load(app);
    *app.state::<AppState>().settings_mut() = settings.clone();

    log::info!(
        "desktop started (server: {}, mode: {}, edge: {})",
        config::server_origin(),
        settings.mode,
        settings.button_edge
    );

    create_button_window(app, &settings)?;
    create_platform_window(app)?;
    create_tray(app)?;
    spawn_button_snap_loop(app.clone());
    spawn_destroy_watchdog(app.clone());
    ensure_autostart(app);

    if std::env::var("RONG_AUTO_OPEN").is_ok() {
        let app_handle = app.clone();
        thread::spawn(move || {
            thread::sleep(Duration::from_secs(3));
            open_platform(app_handle);
        });
    }
    Ok(())
}

/// 前端诊断日志转发到应用日志。
#[tauri::command]
pub fn log_frontend(message: String) {
    log::info!("[frontend] {message}");
}

fn create_button_window(app: &AppHandle, settings: &Settings) -> tauri::Result<()> {
    let window =
        tauri::WebviewWindowBuilder::new(app, BUTTON_LABEL, WebviewUrl::App("button.html".into()))
            .title("榕课堂")
            .inner_size(BUTTON_SIZE, BUTTON_SIZE)
            .transparent(true)
            .decorations(false)
            .always_on_top(true)
            .skip_taskbar(true)
            .resizable(false)
            .shadow(false)
            .visible(true)
            .build()?;

    if let Some(monitor) = button_start_monitor(app, settings) {
        let position = button_position(&monitor, settings);
        let _ = window.set_position(Position::Physical(position));
    }
    Ok(())
}

fn button_start_monitor(app: &AppHandle, settings: &Settings) -> Option<Monitor> {
    if let Some(name) = &settings.button_monitor {
        if let Ok(monitors) = app.available_monitors() {
            if let Some(monitor) = monitors
                .into_iter()
                .find(|monitor| monitor.name() == Some(name))
            {
                return Some(monitor);
            }
        }
    }
    app.primary_monitor().ok().flatten()
}

fn create_platform_window(app: &AppHandle) -> tauri::Result<()> {
    let window = tauri::window::WindowBuilder::new(app, PLATFORM_LABEL)
        .title("榕课堂")
        .inner_size(1280.0, 800.0)
        .transparent(true)
        .decorations(false)
        .always_on_top(true)
        .skip_taskbar(true)
        .resizable(false)
        .shadow(false)
        .visible(false)
        .build()?;

    let size = window.inner_size()?;
    window.add_child(
        tauri::webview::WebviewBuilder::new(SHELL_LABEL, WebviewUrl::App("platform.html".into()))
            .transparent(true)
            .auto_resize(),
        Position::Physical(PhysicalPosition::new(0, 0)),
        Size::Physical(size),
    )?;
    Ok(())
}

fn create_tray(app: &AppHandle) -> tauri::Result<()> {
    let open = MenuItem::with_id(app, "tray-open", "打开浮台", true, None::<&str>)?;
    let quit = MenuItem::with_id(app, "tray-quit", "退出", true, None::<&str>)?;
    let menu = Menu::with_items(app, &[&open, &quit])?;

    let mut builder = TrayIconBuilder::with_id("main")
        .menu(&menu)
        .show_menu_on_left_click(false)
        .on_tray_icon_event(|tray, event| {
            if let TrayIconEvent::Click {
                button: MouseButton::Left,
                button_state: MouseButtonState::Up,
                ..
            } = event
            {
                open_platform(tray.app_handle().clone());
            }
        });
    if let Some(icon) = app.default_window_icon() {
        builder = builder.icon(icon.clone());
    }
    builder.build(app)?;
    Ok(())
}

/// 打开浮台并把窗口铺满悬浮按钮所在的显示器。
#[tauri::command]
pub fn open_platform(app: AppHandle) {
    if let Err(error) = open_platform_inner(&app) {
        log::error!("failed to open platform: {error}");
    }
}

fn open_platform_inner(app: &AppHandle) -> tauri::Result<()> {
    let Some(window) = app.get_window(PLATFORM_LABEL) else {
        return Ok(());
    };

    if let Some(monitor) = button_monitor(app) {
        window.set_position(Position::Physical(*monitor.position()))?;
        window.set_size(Size::Physical(*monitor.size()))?;
    }
    *app.state::<AppState>().destroy_at.lock().unwrap() = None;
    log::info!("platform: open");

    window.show()?;
    window.set_focus()?;
    if let Some(button) = app.get_webview_window(BUTTON_LABEL) {
        let _ = button.hide();
    }

    if app.state::<AppState>().settings().mode == "web" {
        remote::activate(app);
    }
    Ok(())
}

#[tauri::command]
pub fn close_platform(app: AppHandle) {
    let Some(window) = app.get_window(PLATFORM_LABEL) else {
        return;
    };
    log::info!("platform: close");
    let _ = window.hide();
    if let Some(button) = app.get_webview_window(BUTTON_LABEL) {
        let _ = button.show();
    }
    *app.state::<AppState>().destroy_at.lock().unwrap() =
        Some(Instant::now() + Duration::from_secs(REMOTE_IDLE_SECS));
}

fn spawn_destroy_watchdog(app: AppHandle) {
    thread::spawn(move || loop {
        thread::sleep(Duration::from_secs(30));
        let due = {
            let state = app.state::<AppState>();
            let mut guard = state.destroy_at.lock().unwrap();
            match *guard {
                Some(at) if at <= Instant::now() => {
                    *guard = None;
                    true
                }
                _ => false,
            }
        };
        if due {
            let destroy_app = app.clone();
            let _ = app.run_on_main_thread(move || remote::destroy(&destroy_app));
        }
    });
}

#[tauri::command]
pub fn set_mode(app: AppHandle, mode: String) {
    let normalized = if mode == "blackboard" {
        "blackboard"
    } else {
        "web"
    };
    {
        let state = app.state::<AppState>();
        state.settings_mut().mode = normalized.to_string();
    }
    config::save(&app);
    if normalized == "web" {
        remote::activate(&app);
    } else {
        remote::deactivate(&app);
    }
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct SettingsPayload {
    mode: String,
    remote_status: &'static str,
    server_origin: &'static str,
}

#[tauri::command]
pub fn get_settings(app: AppHandle) -> SettingsPayload {
    let state = app.state::<AppState>();
    let mode = state.settings().mode;
    let remote_status = state.remote_status.lock().unwrap().as_str();
    SettingsPayload {
        mode,
        remote_status,
        server_origin: config::server_origin(),
    }
}

#[tauri::command]
pub fn set_remote_bounds(app: AppHandle, x: f64, y: f64, width: f64, height: f64) {
    remote::set_bounds(&app, x, y, width, height);
}

#[tauri::command]
pub fn retry_remote(app: AppHandle) {
    remote::retry(&app);
}

#[tauri::command]
pub fn show_button_menu(window: tauri::WebviewWindow) {
    let app = window.app_handle();
    let autostart_enabled = app.autolaunch().is_enabled().unwrap_or(false);

    let Ok(open) = MenuItem::with_id(app, "button-open", "打开浮台", true, None::<&str>) else {
        return;
    };
    let Ok(autostart) = CheckMenuItem::with_id(
        app,
        "button-autostart",
        "开机自启",
        true,
        autostart_enabled,
        None::<&str>,
    ) else {
        return;
    };
    let Ok(quit) = MenuItem::with_id(app, "button-quit", "退出", true, None::<&str>) else {
        return;
    };
    let Ok(menu) = Menu::with_items(app, &[&open, &autostart, &quit]) else {
        return;
    };
    let _ = window.popup_menu(&menu);
}

#[tauri::command]
pub fn quit_app(app: AppHandle) {
    app.exit(0);
}

pub fn on_menu_event(app: &AppHandle, id: &str) {
    match id {
        "tray-open" | "button-open" => open_platform(app.clone()),
        "tray-quit" | "button-quit" => app.exit(0),
        "button-autostart" => toggle_autostart(app),
        _ => {}
    }
}

fn toggle_autostart(app: &AppHandle) {
    let manager = app.autolaunch();
    match manager.is_enabled() {
        Ok(true) => {
            if let Err(error) = manager.disable() {
                log::warn!("failed to disable autostart: {error}");
            }
        }
        Ok(false) => {
            if let Err(error) = manager.enable() {
                log::warn!("failed to enable autostart: {error}");
            }
        }
        Err(error) => log::warn!("failed to query autostart state: {error}"),
    }
}

fn ensure_autostart(app: &AppHandle) {
    let manager = app.autolaunch();
    if manager.is_enabled().unwrap_or(false) {
        return;
    }
    if app.state::<AppState>().settings().autostart_ready {
        return;
    }
    // 开发构建不写入用户注册表。
    if cfg!(debug_assertions) {
        return;
    }
    match manager.enable() {
        Ok(()) => {
            app.state::<AppState>().settings_mut().autostart_ready = true;
            config::save(app);
        }
        Err(error) => log::warn!("failed to enable autostart: {error}"),
    }
}

pub fn on_window_event(window: &tauri::Window, event: &WindowEvent) {
    match event {
        WindowEvent::Moved(_) => {
            if window.label() == BUTTON_LABEL {
                let state = window.app_handle().state::<AppState>();
                *state.button_move_at.lock().unwrap() = Some(Instant::now());
            }
        }
        WindowEvent::CloseRequested { api, .. } => {
            if window.label() == PLATFORM_LABEL {
                api.prevent_close();
                close_platform(window.app_handle().clone());
            } else if window.label() == BUTTON_LABEL {
                api.prevent_close();
            }
        }
        _ => {}
    }
}

fn spawn_button_snap_loop(app: AppHandle) {
    thread::spawn(move || loop {
        thread::sleep(Duration::from_millis(200));
        let due = {
            let state = app.state::<AppState>();
            let mut guard = state.button_move_at.lock().unwrap();
            match *guard {
                Some(at) if at.elapsed() >= Duration::from_millis(300) => {
                    *guard = None;
                    true
                }
                _ => false,
            }
        };
        if due {
            snap_button(&app);
        }
    });
}

fn snap_button(app: &AppHandle) {
    let Some(button) = app.get_webview_window(BUTTON_LABEL) else {
        return;
    };
    let (Ok(position), Ok(size)) = (button.outer_position(), button.outer_size()) else {
        return;
    };

    let center_x = position.x + size.width as i32 / 2;
    let center_y = position.y + size.height as i32 / 2;
    let monitor = app
        .monitor_from_point(center_x as f64, center_y as f64)
        .ok()
        .flatten()
        .or_else(|| button.current_monitor().ok().flatten());
    let Some(monitor) = monitor else {
        return;
    };

    let monitor_position = monitor.position();
    let monitor_size = monitor.size();
    let button_height = size.height as i32;
    let button_visual = (BUTTON_SIZE * monitor.scale_factor()).round() as i32;

    let left_x = monitor_position.x;
    let right_x = monitor_position.x + monitor_size.width as i32 - button_visual;
    let edge = if (position.x - left_x).abs() <= (position.x - right_x).abs() {
        "left"
    } else {
        "right"
    };
    let x = if edge == "left" { left_x } else { right_x };

    let min_y = monitor_position.y;
    let max_y = monitor_position.y + monitor_size.height as i32 - button_height;
    let y = position.y.clamp(min_y, max_y);
    let _ = button.set_position(Position::Physical(PhysicalPosition::new(x, y)));

    {
        let state = app.state::<AppState>();
        let mut settings = state.settings_mut();
        settings.button_edge = edge.to_string();
        settings.button_y_ratio = if max_y > min_y {
            (y - min_y) as f64 / (max_y - min_y) as f64
        } else {
            0.0
        };
        settings.button_monitor = monitor.name().cloned();
    }
    config::save(app);
}

fn button_monitor(app: &AppHandle) -> Option<Monitor> {
    let button = app.get_webview_window(BUTTON_LABEL)?;
    let position = button.outer_position().ok()?;
    let size = button.outer_size().ok()?;
    let center_x = position.x + size.width as i32 / 2;
    let center_y = position.y + size.height as i32 / 2;
    app.monitor_from_point(center_x as f64, center_y as f64)
        .ok()
        .flatten()
        .or_else(|| button.current_monitor().ok().flatten())
}

fn button_position(monitor: &Monitor, settings: &Settings) -> PhysicalPosition<i32> {
    let monitor_position = monitor.position();
    let monitor_size = monitor.size();
    let scale = monitor.scale_factor();
    let button_size = (BUTTON_SIZE * scale).round() as i32;

    let max_y = monitor_size.height as i32 - button_size;
    let y = monitor_position.y
        + (settings.button_y_ratio.clamp(0.0, 1.0) * max_y as f64).round() as i32;
    let x = if settings.button_edge == "left" {
        monitor_position.x
    } else {
        monitor_position.x + monitor_size.width as i32 - button_size
    };
    PhysicalPosition::new(x, y)
}
