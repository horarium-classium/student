use crate::settings::{self, Settings, SettingsState};
use tauri::{
    menu::{CheckMenuItem, Menu, MenuItem, PredefinedMenuItem},
    tray::TrayIconBuilder,
    App, AppHandle, Emitter, Manager,
};

pub struct TrayState {
    sound: CheckMenuItem<tauri::Wry>,
    speech: CheckMenuItem<tauri::Wry>,
}

pub fn sync(app: &AppHandle, settings: &Settings) {
    if let Some(tray) = app.try_state::<TrayState>() {
        let _ = tray.sound.set_checked(settings.sound_enabled);
        let _ = tray.speech.set_checked(settings.speech_enabled);
    }
}

pub fn open(app: &AppHandle) {
    if let Some(window) = app.get_webview_window("main") {
        let _ = window.show();
        let _ = window.unminimize();
        let _ = window.set_focus();
    }
}

pub fn setup(app: &App, settings: &Settings) -> tauri::Result<()> {
    let open_item = MenuItem::with_id(app, "open", "Բացել", true, None::<&str>)?;
    let refresh = MenuItem::with_id(app, "refresh", "Թարմացնել դասացուցակը", true, None::<&str>)?;
    let sound = CheckMenuItem::with_id(
        app,
        "sound",
        "Ձայն",
        true,
        settings.sound_enabled,
        None::<&str>,
    )?;
    let speech = CheckMenuItem::with_id(
        app,
        "speech",
        "Խոսք",
        true,
        settings.speech_enabled,
        None::<&str>,
    )?;
    let settings_item = MenuItem::with_id(app, "settings", "Կարգավորումներ", true, None::<&str>)?;
    let quit = MenuItem::with_id(app, "quit", "Ելք", true, None::<&str>)?;
    let menu = Menu::with_items(
        app,
        &[
            &open_item,
            &PredefinedMenuItem::separator(app)?,
            &refresh,
            &PredefinedMenuItem::separator(app)?,
            &sound,
            &speech,
            &PredefinedMenuItem::separator(app)?,
            &settings_item,
            &PredefinedMenuItem::separator(app)?,
            &quit,
        ],
    )?;
    let icon = if cfg!(target_os = "macos") {
        tauri::include_image!("icons/tray-template.png")
    } else {
        tauri::include_image!("icons/tray.png")
    };
    TrayIconBuilder::new()
        .icon(icon)
        .icon_as_template(cfg!(target_os = "macos"))
        .tooltip("Դասացուցակ")
        .menu(&menu)
        .on_menu_event(|app, event| match event.id.as_ref() {
            "open" => open(app),
            "refresh" => {
                let _ = app.emit("refresh-schedule", ());
            }
            "settings" => {
                open(app);
                let _ = app.emit("open-settings", ());
            }
            "sound" | "speech" => {
                let current = app
                    .state::<SettingsState>()
                    .0
                    .lock()
                    .map(|value| value.clone())
                    .map_err(|error| error.to_string());
                let result = current.and_then(|current| {
                    let (key, enabled) = if event.id.as_ref() == "sound" {
                        ("soundEnabled", !current.sound_enabled)
                    } else {
                        ("speechEnabled", !current.speech_enabled)
                    };
                    settings::set_setting(app.clone(), key.into(), enabled)
                });
                if let Err(error) = result {
                    let current = app
                        .state::<SettingsState>()
                        .0
                        .lock()
                        .map(|value| value.clone())
                        .map_err(|error| error.to_string());
                    if let Ok(current) = current {
                        sync(app, &current);
                    }
                    open(app);
                    let _ = app.emit("settings-error", error);
                }
            }
            "quit" => app.exit(0),
            _ => {}
        })
        .build(app)?;
    app.manage(TrayState { sound, speech });
    Ok(())
}
