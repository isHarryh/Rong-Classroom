#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

mod board;
mod config;
mod remote;
mod shell;

fn main() {
    tauri::Builder::default()
        .plugin(tauri_plugin_single_instance::init(|app, _args, _cwd| {
            shell::open_platform(app.clone());
        }))
        .plugin(tauri_plugin_autostart::init(
            tauri_plugin_autostart::MacosLauncher::LaunchAgent,
            None,
        ))
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_dialog::init())
        .plugin(
            tauri_plugin_log::Builder::new()
                .level(log::LevelFilter::Info)
                .targets([
                    tauri_plugin_log::Target::new(tauri_plugin_log::TargetKind::LogDir {
                        file_name: Some("desktop".into()),
                    }),
                    tauri_plugin_log::Target::new(tauri_plugin_log::TargetKind::Stdout),
                ])
                .build(),
        )
        .manage(shell::AppState::default())
        .setup(|app| {
            shell::setup(app.handle())?;
            Ok(())
        })
        .on_menu_event(|app, event| {
            shell::on_menu_event(app, event.id().as_ref());
        })
        .on_window_event(|window, event| {
            shell::on_window_event(window, event);
        })
        .invoke_handler(tauri::generate_handler![
            shell::open_platform,
            shell::close_platform,
            shell::set_mode,
            shell::get_settings,
            shell::set_remote_bounds,
            shell::retry_remote,
            shell::show_button_menu,
            shell::quit_app,
            shell::log_frontend,
            board::get_board,
            board::auto_save_board,
            board::save_board,
            board::save_board_copy,
            board::list_boards,
            board::open_board,
            board::delete_board,
            board::new_board,
            board::export_png,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
