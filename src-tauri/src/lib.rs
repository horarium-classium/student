use scheduler::{start_scheduler, update_schedule, SchedulerState};
use std::{collections::HashMap, sync::Mutex};
use tauri::{Manager, WindowEvent};
use tauri_plugin_autostart::ManagerExt;

mod audio;
mod model;
mod scheduler;
mod settings;
mod storage;
mod tray;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .manage(SchedulerState {
            schedule: Mutex::new(HashMap::new()),
        })
        .invoke_handler(tauri::generate_handler![
            update_schedule,
            audio::play_bell,
            storage::read_schedule_cache,
            storage::write_schedule_cache,
            settings::get_settings,
            settings::set_setting
        ])
        .plugin(tauri_plugin_notification::init())
        .plugin(tauri_plugin_autostart::init(
            tauri_plugin_autostart::MacosLauncher::LaunchAgent,
            None,
        ))
        .on_window_event(|window, event| {
            if let WindowEvent::CloseRequested { api, .. } = event {
                if window.app_handle().try_state::<tray::TrayState>().is_some() {
                    api.prevent_close();
                    let _ = window.hide();
                }
            }
        })
        .setup(|app| {
            let settings_path = app.path().app_data_dir()?.join("settings.json");
            let settings = settings::read(&settings_path).unwrap_or_else(|error| {
                eprintln!("Could not read settings, using defaults: {error}");
                settings::Settings::default()
            });
            // Startup behavior is fixed, including for existing installations.
            let autostart = app.autolaunch();
            if let Err(error) = autostart.enable() {
                eprintln!("Could not enable launch at login: {error}");
            }
            app.manage(settings::SettingsState(Mutex::new(settings.clone())));
            start_scheduler(app.handle().clone());
            let tray_available = match tray::setup(app, &settings) {
                Ok(()) => true,
                Err(error) => {
                    eprintln!("System tray unavailable; keeping the window accessible: {error}");
                    false
                }
            };
            if !tray_available {
                if let Some(window) = app.get_webview_window("main") {
                    window.show()?;
                }
            }
            Ok(())
        })
        .build(tauri::generate_context!())
        .expect("error while building tauri application")
        .run(|app, event| {
            // Dock reopen is a macOS lifecycle event; window operations stay portable.
            #[cfg(target_os = "macos")]
            if let tauri::RunEvent::Reopen { .. } = event {
                tray::open(app);
            }
            #[cfg(not(target_os = "macos"))]
            let _ = (app, event);
        });
}
