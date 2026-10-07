use std::fs;
use std::path::{Path, PathBuf};

use base64::Engine as _;
use serde::{Deserialize, Serialize};
use serde_json::Value;
use tauri::{AppHandle, Manager};

use crate::config;
use crate::shell::AppState;

const DRAFT_FILE: &str = "board-draft.json";
const DRAFT_VERSION: u64 = 1;
const BOARDS_DIR: &str = "boards";
const THUMBNAIL_FIELD: &str = "thumbnail";

#[derive(Serialize, Deserialize)]
struct Draft {
    version: u64,
    #[serde(default)]
    file: Option<String>,
    board: Value,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct BoardPayload {
    file: Option<String>,
    content: Option<String>,
    file_missing: bool,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct BoardSummary {
    file: String,
    name: String,
    modified: u64,
    thumbnail: Option<String>,
}

fn draft_path(app: &AppHandle) -> Result<PathBuf, String> {
    app.path()
        .app_config_dir()
        .map(|dir| dir.join(DRAFT_FILE))
        .map_err(|error| format!("failed to resolve config dir: {error}"))
}

fn boards_dir(app: &AppHandle) -> Result<PathBuf, String> {
    app.path()
        .app_config_dir()
        .map(|dir| dir.join(BOARDS_DIR))
        .map_err(|error| format!("failed to resolve config dir: {error}"))
}

fn bind(app: &AppHandle, file: Option<String>) {
    *app.state::<AppState>().board_file.lock().unwrap() = file;
}

fn parse_board(content: &str) -> Result<Value, String> {
    let value: Value =
        serde_json::from_str(content).map_err(|error| format!("invalid board json: {error}"))?;
    if !value.is_object() {
        return Err("board json must be an object".into());
    }
    Ok(value)
}

fn parse_saved_board(content: &str) -> Result<Value, String> {
    let value = parse_board(content)?;
    if !value.get("strokes").is_some_and(Value::is_array) {
        return Err("board json is missing strokes".into());
    }
    Ok(value)
}

fn without_thumbnail(board: &Value) -> Value {
    let mut stripped = board.clone();
    if let Some(object) = stripped.as_object_mut() {
        object.remove(THUMBNAIL_FIELD);
    }
    stripped
}

fn write_draft(app: &AppHandle, file: &Option<String>, board: &Value) -> Result<(), String> {
    let draft = Draft {
        version: DRAFT_VERSION,
        file: file.clone(),
        board: without_thumbnail(board),
    };
    let content = serde_json::to_string_pretty(&draft)
        .map_err(|error| format!("failed to serialize draft: {error}"))?;
    config::write_atomic(&draft_path(app)?, content.as_bytes())
}

fn board_path(app: &AppHandle, path: &str) -> Result<PathBuf, String> {
    let dir = fs::canonicalize(boards_dir(app)?)
        .map_err(|error| format!("failed to resolve boards dir: {error}"))?;
    let candidate =
        fs::canonicalize(path).map_err(|error| format!("failed to resolve board file: {error}"))?;
    if !candidate.starts_with(&dir) {
        return Err("board file is outside the boards directory".into());
    }
    Ok(candidate)
}

fn next_board_path(app: &AppHandle) -> Result<PathBuf, String> {
    let dir = boards_dir(app)?;
    fs::create_dir_all(&dir).map_err(|error| format!("failed to create boards dir: {error}"))?;
    let stamp = chrono::Local::now().format("%Y%m%d-%H%M%S");
    for attempt in 1..1000 {
        let name = if attempt == 1 {
            format!("Board-{stamp}.json")
        } else {
            format!("Board-{stamp}-{attempt}.json")
        };
        let candidate = dir.join(name);
        if !candidate.exists() {
            return Ok(candidate);
        }
    }
    Err("too many board files for this second".into())
}

fn merge_thumbnail(file: &str, board: &mut Value) {
    let Ok(existing) = fs::read_to_string(file) else {
        return;
    };
    let Ok(value) = serde_json::from_str::<Value>(&existing) else {
        return;
    };
    let Some(thumbnail) = value.get(THUMBNAIL_FIELD) else {
        return;
    };
    if let Some(object) = board.as_object_mut() {
        object.insert(THUMBNAIL_FIELD.into(), thumbnail.clone());
    }
}

#[tauri::command]
pub fn get_board(app: AppHandle) -> Result<BoardPayload, String> {
    let path = draft_path(&app)?;
    let Ok(text) = fs::read_to_string(&path) else {
        bind(&app, None);
        return Ok(BoardPayload {
            file: None,
            content: None,
            file_missing: false,
        });
    };
    let draft: Draft =
        serde_json::from_str(&text).map_err(|error| format!("invalid draft file: {error}"))?;
    bind(&app, draft.file.clone());
    if let Some(file) = &draft.file {
        return match fs::read_to_string(file) {
            Ok(content) => Ok(BoardPayload {
                file: draft.file,
                content: Some(content),
                file_missing: false,
            }),
            Err(_) => Ok(BoardPayload {
                file: draft.file,
                content: Some(draft.board.to_string()),
                file_missing: true,
            }),
        };
    }
    Ok(BoardPayload {
        file: None,
        content: Some(draft.board.to_string()),
        file_missing: false,
    })
}

#[tauri::command]
pub fn auto_save_board(app: AppHandle, content: String) -> Result<(), String> {
    let mut board = parse_board(&content)?;
    let binding = app.state::<AppState>().board_file.lock().unwrap().clone();
    write_draft(&app, &binding, &board)?;
    if let Some(file) = binding {
        merge_thumbnail(&file, &mut board);
        let content = serde_json::to_string(&board)
            .map_err(|error| format!("failed to serialize board: {error}"))?;
        config::write_atomic(Path::new(&file), content.as_bytes())?;
    }
    Ok(())
}

#[tauri::command]
pub fn save_board(app: AppHandle, content: String) -> Result<String, String> {
    let board = parse_saved_board(&content)?;
    let target = match app.state::<AppState>().board_file.lock().unwrap().clone() {
        Some(file) => PathBuf::from(file),
        None => next_board_path(&app)?,
    };
    config::write_atomic(&target, content.as_bytes())?;
    let path = fs::canonicalize(&target)
        .unwrap_or(target)
        .to_string_lossy()
        .into_owned();
    bind(&app, Some(path.clone()));
    write_draft(&app, &Some(path.clone()), &board)?;
    Ok(path)
}

#[tauri::command]
pub fn save_board_copy(app: AppHandle, content: String) -> Result<String, String> {
    let board = parse_saved_board(&content)?;
    let target = next_board_path(&app)?;
    config::write_atomic(&target, content.as_bytes())?;
    let path = fs::canonicalize(&target)
        .unwrap_or(target)
        .to_string_lossy()
        .into_owned();
    bind(&app, Some(path.clone()));
    write_draft(&app, &Some(path.clone()), &board)?;
    Ok(path)
}

#[tauri::command]
pub fn list_boards(app: AppHandle) -> Result<Vec<BoardSummary>, String> {
    let dir = boards_dir(&app)?;
    let Ok(entries) = fs::read_dir(&dir) else {
        return Ok(Vec::new());
    };
    let mut summaries = Vec::new();
    for entry in entries.flatten() {
        let path = entry.path();
        if path.extension().and_then(|value| value.to_str()) != Some("json") {
            continue;
        }
        let Ok(text) = fs::read_to_string(&path) else {
            continue;
        };
        let Ok(value) = serde_json::from_str::<Value>(&text) else {
            continue;
        };
        let thumbnail = value
            .get(THUMBNAIL_FIELD)
            .and_then(Value::as_str)
            .map(str::to_owned);
        let modified = entry
            .metadata()
            .ok()
            .and_then(|meta| meta.modified().ok())
            .and_then(|time| time.duration_since(std::time::UNIX_EPOCH).ok())
            .map(|duration| duration.as_millis() as u64)
            .unwrap_or(0);
        let file = fs::canonicalize(&path).unwrap_or(path);
        summaries.push(BoardSummary {
            name: file
                .file_stem()
                .and_then(|value| value.to_str())
                .unwrap_or("board")
                .to_owned(),
            file: file.to_string_lossy().into_owned(),
            modified,
            thumbnail,
        });
    }
    summaries.sort_by(|a, b| b.modified.cmp(&a.modified));
    Ok(summaries)
}

#[tauri::command]
pub fn open_board(app: AppHandle, path: String) -> Result<String, String> {
    let target = board_path(&app, &path)?;
    let content = fs::read_to_string(&target)
        .map_err(|error| format!("failed to read board file: {error}"))?;
    let board = parse_saved_board(&content)?;
    let file = target.to_string_lossy().into_owned();
    bind(&app, Some(file.clone()));
    write_draft(&app, &Some(file), &board)?;
    Ok(content)
}

#[tauri::command]
pub fn delete_board(app: AppHandle, path: String) -> Result<(), String> {
    let target = board_path(&app, &path)?;
    let bound = app.state::<AppState>().board_file.lock().unwrap().clone();
    let was_bound = bound
        .as_deref()
        .and_then(|value| fs::canonicalize(value).ok())
        .is_some_and(|value| value == target);
    fs::remove_file(&target).map_err(|error| format!("failed to delete board file: {error}"))?;
    if was_bound {
        bind(&app, None);
        let path = draft_path(&app)?;
        if let Ok(text) = fs::read_to_string(&path) {
            if let Ok(mut draft) = serde_json::from_str::<Draft>(&text) {
                draft.file = None;
                if let Ok(content) = serde_json::to_string_pretty(&draft) {
                    config::write_atomic(&path, content.as_bytes())?;
                }
            }
        }
    }
    Ok(())
}

#[tauri::command]
pub fn new_board(app: AppHandle, content: String) -> Result<(), String> {
    let board = parse_board(&content)?;
    bind(&app, None);
    write_draft(&app, &None, &board)
}

#[tauri::command]
pub fn export_png(path: String, data: String) -> Result<(), String> {
    let bytes = base64::engine::general_purpose::STANDARD
        .decode(data.as_bytes())
        .map_err(|error| format!("invalid png data: {error}"))?;
    config::write_atomic(Path::new(&path), &bytes)
}
