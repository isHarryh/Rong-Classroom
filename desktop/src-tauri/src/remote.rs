use std::sync::atomic::Ordering;
use std::thread;
use std::time::{Duration, Instant};

use serde::Serialize;
use tauri::webview::{PageLoadEvent, WebviewBuilder};
use tauri::{
    AppHandle, Emitter, LogicalPosition, LogicalSize, Manager, PhysicalSize, Position, Size, Url,
    WebviewUrl,
};
use tauri_plugin_opener::OpenerExt;

use crate::config;
use crate::shell::{AppState, EDGE, PLATFORM_LABEL};

const REMOTE_LABEL: &str = "remote";
const WATCHDOG_TIMEOUT_SECS: u64 = 12;

#[derive(Clone, Copy, Debug, Default, PartialEq, Eq)]
pub enum RemoteStatus {
    #[default]
    Absent,
    Loading,
    Ok,
    Failed,
}

impl RemoteStatus {
    pub fn as_str(self) -> &'static str {
        match self {
            Self::Absent => "absent",
            Self::Loading => "loading",
            Self::Ok => "ok",
            Self::Failed => "failed",
        }
    }
}

#[derive(Clone, Serialize)]
struct StatusPayload {
    status: &'static str,
}

pub fn get_status(app: &AppHandle) -> RemoteStatus {
    *app.state::<AppState>().remote_status.lock().unwrap()
}

fn set_status(app: &AppHandle, status: RemoteStatus) {
    *app.state::<AppState>().remote_status.lock().unwrap() = status;
}

fn emit_status(app: &AppHandle, status: RemoteStatus) {
    let _ = app.emit_to(
        PLATFORM_LABEL,
        "remote-status",
        StatusPayload {
            status: status.as_str(),
        },
    );
}

/// 进入网页模式：确保远端 Webview 存在并显示。
pub fn activate(app: &AppHandle) {
    let status = ensure(app);
    if status == RemoteStatus::Ok {
        if let Some(webview) = app.get_webview(REMOTE_LABEL) {
            log::info!("remote: show");
            let _ = webview.show();
        }
    }
    log::info!("remote: activate -> {}", status.as_str());
    emit_status(app, status);
}

/// 进入黑板模式：仅隐藏远端 Webview，不销毁。
pub fn deactivate(app: &AppHandle) {
    if let Some(webview) = app.get_webview(REMOTE_LABEL) {
        log::info!("remote: hide");
        let _ = webview.hide();
    }
}

/// 销毁远端 Webview。
pub fn destroy(app: &AppHandle) {
    close_webview(app);
    set_status(app, RemoteStatus::Absent);
    emit_status(app, RemoteStatus::Absent);
}

/// 关闭远端 Webview，但不改变状态。
fn close_webview(app: &AppHandle) {
    if let Some(webview) = app.get_webview(REMOTE_LABEL) {
        log::info!("remote: close webview");
        let _ = webview.close();
    }
}

/// 重试加载：先销毁再重建。
pub fn retry(app: &AppHandle) {
    destroy(app);
    activate(app);
}

pub fn set_bounds(app: &AppHandle, x: f64, y: f64, width: f64, height: f64) {
    if let Some(webview) = app.get_webview(REMOTE_LABEL) {
        let _ = webview.set_position(Position::Logical(LogicalPosition::new(x, y)));
        let _ = webview.set_size(Size::Logical(LogicalSize::new(
            width.max(1.0),
            height.max(1.0),
        )));
    }
}

fn ensure(app: &AppHandle) -> RemoteStatus {
    if app.get_webview(REMOTE_LABEL).is_some() {
        return get_status(app);
    }

    let Ok(origin) = Url::parse(config::server_origin()) else {
        log::error!("invalid server origin: {}", config::server_origin());
        set_status(app, RemoteStatus::Failed);
        return RemoteStatus::Failed;
    };

    let generation = app
        .state::<AppState>()
        .load_generation
        .fetch_add(1, Ordering::SeqCst)
        + 1;
    set_status(app, RemoteStatus::Loading);
    *app.state::<AppState>().load_activity.lock().unwrap() = Some(Instant::now());
    log::info!("remote: checking server {}", config::server_origin());

    let app_handle = app.clone();
    thread::spawn(move || {
        if !server_reachable(&origin) {
            log::warn!("remote: server unreachable");
            let inner = app_handle.clone();
            let _ = app_handle.run_on_main_thread(move || {
                let state = inner.state::<AppState>();
                if state.load_generation.load(Ordering::SeqCst) == generation {
                    set_status(&inner, RemoteStatus::Failed);
                    emit_status(&inner, RemoteStatus::Failed);
                }
            });
            return;
        }
        let inner = app_handle.clone();
        let _ = app_handle.run_on_main_thread(move || {
            create_remote(&inner, generation, origin);
        });
    });
    RemoteStatus::Loading
}

fn create_remote(app: &AppHandle, generation: u64, origin: Url) -> RemoteStatus {
    if app.get_webview(REMOTE_LABEL).is_some() {
        return get_status(app);
    }
    if app
        .state::<AppState>()
        .load_generation
        .load(Ordering::SeqCst)
        != generation
    {
        return RemoteStatus::Loading;
    }
    let Some(window) = app.get_window(PLATFORM_LABEL) else {
        set_status(app, RemoteStatus::Failed);
        return RemoteStatus::Failed;
    };
    log::info!("remote: creating webview for {}", config::server_origin());

    let navigation_origin = origin.clone();
    let load_origin = origin.clone();
    let navigation_app = app.clone();
    let load_app = app.clone();
    let builder = WebviewBuilder::new(REMOTE_LABEL, WebviewUrl::External(origin))
        .on_navigation(move |url| {
            if url.scheme() == "about" || same_origin(url, &navigation_origin) {
                true
            } else {
                if let Err(error) = navigation_app.opener().open_url(url.as_str(), None::<&str>) {
                    log::warn!("failed to open external url: {error}");
                }
                false
            }
        })
        .on_page_load(move |_webview, payload| {
            log::info!(
                "remote: page load {:?} url={}",
                payload.event(),
                payload.url()
            );
            let state = load_app.state::<AppState>();
            *state.load_activity.lock().unwrap() = Some(Instant::now());
            if payload.event() != PageLoadEvent::Finished {
                return;
            }
            let loaded_url = payload.url().clone();
            if loaded_url.scheme() == "about" {
                return;
            }
            if state.load_generation.load(Ordering::SeqCst) != generation {
                return;
            }
            if same_origin(&loaded_url, &load_origin) {
                set_status(&load_app, RemoteStatus::Ok);
                if state.settings().mode == "web" {
                    if let Some(webview) = load_app.get_webview(REMOTE_LABEL) {
                        let _ = webview.show();
                    }
                }
                emit_status(&load_app, RemoteStatus::Ok);
            } else {
                log::warn!("remote: load failed, landed on {loaded_url}");
                set_status(&load_app, RemoteStatus::Failed);
                if let Some(webview) = load_app.get_webview(REMOTE_LABEL) {
                    let _ = webview.hide();
                }
                emit_status(&load_app, RemoteStatus::Failed);
                let app_handle = load_app.clone();
                thread::spawn(move || {
                    thread::sleep(Duration::from_millis(200));
                    let inner = app_handle.clone();
                    let _ = app_handle.run_on_main_thread(move || {
                        let state = inner.state::<AppState>();
                        if state.load_generation.load(Ordering::SeqCst) == generation {
                            close_webview(&inner);
                        }
                    });
                });
            }
        });

    let (position, size) = child_bounds(app);
    log::info!("remote: initial bounds {position:?} {size:?}");
    match window.add_child(builder, position, size) {
        Ok(webview) => {
            // 加载完成前保持隐藏，由外壳展示加载提示。
            let _ = webview.hide();
            spawn_watchdog(app.clone(), generation);
            RemoteStatus::Loading
        }
        Err(error) => {
            log::error!("failed to create remote webview: {error}");
            set_status(app, RemoteStatus::Failed);
            RemoteStatus::Failed
        }
    }
}

fn server_reachable(origin: &Url) -> bool {
    use std::net::{TcpStream, ToSocketAddrs};

    let Some(host) = origin.host_str() else {
        return false;
    };
    let port = origin.port_or_known_default().unwrap_or(80);
    let Ok(addresses) = (host, port).to_socket_addrs() else {
        return false;
    };
    addresses
        .into_iter()
        .any(|address| TcpStream::connect_timeout(&address, Duration::from_secs(3)).is_ok())
}

fn spawn_watchdog(app: AppHandle, generation: u64) {
    thread::spawn(move || loop {
        thread::sleep(Duration::from_secs(2));
        let state = app.state::<AppState>();
        if state.load_generation.load(Ordering::SeqCst) != generation {
            return;
        }
        if get_status(&app) != RemoteStatus::Loading {
            return;
        }
        let idle = state
            .load_activity
            .lock()
            .unwrap()
            .map(|at| at.elapsed())
            .unwrap_or_default();
        if idle < Duration::from_secs(WATCHDOG_TIMEOUT_SECS) {
            continue;
        }
        let app_handle = app.clone();
        let _ = app.run_on_main_thread(move || {
            log::warn!("remote: load timed out");
            destroy(&app_handle);
            set_status(&app_handle, RemoteStatus::Failed);
            emit_status(&app_handle, RemoteStatus::Failed);
        });
        return;
    });
}

fn same_origin(candidate: &Url, origin: &Url) -> bool {
    candidate.scheme() == origin.scheme()
        && candidate.host_str() == origin.host_str()
        && candidate.port_or_known_default() == origin.port_or_known_default()
}

fn child_bounds(app: &AppHandle) -> (Position, Size) {
    let Some(window) = app.get_window(PLATFORM_LABEL) else {
        return (
            Position::Logical(LogicalPosition::new(EDGE, EDGE)),
            Size::Logical(LogicalSize::new(800.0, 600.0)),
        );
    };
    let scale = window.scale_factor().unwrap_or(1.0);
    let size = window.inner_size().unwrap_or(PhysicalSize::new(1280, 800));
    let width = (size.width as f64 / scale - EDGE * 2.0).max(1.0);
    let height = (size.height as f64 / scale - EDGE * 2.0).max(1.0);
    (
        Position::Logical(LogicalPosition::new(EDGE, EDGE)),
        Size::Logical(LogicalSize::new(width, height)),
    )
}
