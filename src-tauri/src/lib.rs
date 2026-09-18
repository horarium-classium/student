use tauri::{
    menu::{Menu, MenuItem, PredefinedMenuItem},
    tray::TrayIconBuilder,
    Manager, WindowEvent,
};

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_notification::init())
        .plugin(tauri_plugin_autostart::init(
            tauri_plugin_autostart::MacosLauncher::LaunchAgent,
            None,
        ))
        .on_window_event(|window, event| {
            if let WindowEvent::CloseRequested { api, .. } = event {
                api.prevent_close();
                let _ = window.hide();
            }
        })
        .setup(|app| {
            let open = MenuItem::with_id(app, "open", "Բացել", true, None::<&str>)?;
            let sound = MenuItem::with_id(app, "sound", "Ձայն", false, None::<&str>)?;
            let speech = MenuItem::with_id(app, "speech", "Խոսք", false, None::<&str>)?;
            let separator = PredefinedMenuItem::separator(app)?;
            let quit = MenuItem::with_id(app, "quit", "Ելք", true, None::<&str>)?;
            let menu = Menu::with_items(
                app,
                &[&open, &separator, &sound, &speech, &separator, &quit],
            )?;

            TrayIconBuilder::new()
                .icon(app.default_window_icon().cloned().expect("default window icon is configured"))
                .tooltip("Դասացուցակ")
                .menu(&menu)
                .on_menu_event(|app, event| match event.id.as_ref() {
                    "open" => {
                        if let Some(window) = app.get_webview_window("main") {
                            let _ = window.show();
                            let _ = window.set_focus();
                        }
                    }
                    "quit" => app.exit(0),
                    _ => {}
                })
                .build(app)?;
            Ok(())
        })
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
