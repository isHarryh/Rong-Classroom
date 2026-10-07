use serde::{Deserialize, Serialize};
use tauri::{AppHandle, Manager};

use crate::shell::AppState;

/// 构建期注入的服务器地址。
pub fn server_origin() -> &'static str {
    env!("RONG_SERVER_ORIGIN")
}

/// 桌面端持久化配置。
#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", default)]
pub struct Settings {
    pub mode: String,
    pub button_edge: String,
    pub button_y_ratio: f64,
    pub button_monitor: Option<String>,
    pub autostart_ready: bool,
}

impl Default for Settings {
    fn default() -> Self {
        Self {
            mode: "web".into(),
            button_edge: "right".into(),
            button_y_ratio: 0.5,
            button_monitor: None,
            autostart_ready: false,
        }
    }
}

pub fn load(app: &AppHandle) -> Settings {
    let path = settings_path(app);
    std::fs::read_to_string(path)
        .ok()
        .and_then(|content| serde_json::from_str(&content).ok())
        .unwrap_or_default()
}

/// 保存当前配置；调用方不得持有配置锁。
pub fn save(app: &AppHandle) {
    static SAVE_LOCK: std::sync::Mutex<()> = std::sync::Mutex::new(());

    let _guard = SAVE_LOCK.lock().unwrap();
    let settings = app.state::<AppState>().settings();
    let path = settings_path(app);
    let Ok(content) = serde_json::to_string_pretty(&settings) else {
        log::error!("failed to serialize settings");
        return;
    };
    if let Err(error) = write_atomic(&path, content.as_bytes()) {
        log::error!("failed to save settings: {error}");
    }
}

/// 先写临时文件再替换，避免半截文件。
pub(crate) fn write_atomic(path: &std::path::Path, content: &[u8]) -> Result<(), String> {
    let Some(name) = path.file_name() else {
        return Err("invalid file path".into());
    };
    if let Some(parent) = path.parent() {
        std::fs::create_dir_all(parent)
            .map_err(|error| format!("failed to create directory: {error}"))?;
    }
    let temp = path.with_file_name(format!("{}.tmp", name.to_string_lossy()));
    std::fs::write(&temp, content).map_err(|error| format!("failed to write file: {error}"))?;
    std::fs::rename(&temp, path).map_err(|error| format!("failed to replace file: {error}"))
}

fn settings_path(app: &AppHandle) -> std::path::PathBuf {
    app.path()
        .app_config_dir()
        .map(|dir| dir.join("settings.json"))
        .unwrap_or_else(|_| std::path::PathBuf::from("settings.json"))
}
