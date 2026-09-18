use crate::storage::write_json;
use serde::{Deserialize, Serialize};
use std::{fs, path::Path, sync::Mutex};
use tauri::{AppHandle, Emitter, Manager};
use tauri_plugin_autostart::ManagerExt;

#[derive(Clone, Debug, Deserialize, Serialize, PartialEq)]
#[serde(default, rename_all = "camelCase")]
pub struct Settings {
    pub notifications_enabled: bool,
    pub sound_enabled: bool,
    pub speech_enabled: bool,
    pub autostart_enabled: bool,
    pub start_minimized: bool,
}

impl Default for Settings {
    fn default() -> Self {
        Self {
            notifications_enabled: true,
            sound_enabled: true,
            speech_enabled: false,
            autostart_enabled: false,
            start_minimized: false,
        }
    }
}

pub struct SettingsState(pub Mutex<Settings>);

pub fn read(path: &Path) -> Result<Settings, String> {
    match fs::read_to_string(path) {
        Ok(data) => serde_json::from_str(&data).map_err(|error| error.to_string()),
        Err(error) if error.kind() == std::io::ErrorKind::NotFound => Ok(Settings::default()),
        Err(error) => Err(error.to_string()),
    }
}

#[tauri::command]
pub fn get_settings(app: AppHandle) -> Result<Settings, String> {
    let state = app.state::<SettingsState>();
    let mut settings = state.0.lock().map_err(|error| error.to_string())?;
    settings.autostart_enabled = app
        .autolaunch()
        .is_enabled()
        .map_err(|error| error.to_string())?;
    Ok(settings.clone())
}

#[tauri::command]
pub fn set_setting(app: AppHandle, key: String, enabled: bool) -> Result<Settings, String> {
    let state = app.state::<SettingsState>();
    let mut current = state.0.lock().map_err(|error| error.to_string())?;
    let mut updated = current.clone();
    match key.as_str() {
        "notificationsEnabled" => updated.notifications_enabled = enabled,
        "soundEnabled" => updated.sound_enabled = enabled,
        "speechEnabled" => updated.speech_enabled = enabled,
        "autostartEnabled" => updated.autostart_enabled = enabled,
        "startMinimized" => updated.start_minimized = enabled,
        _ => return Err(format!("Unknown setting: {key}")),
    }
    let path = app
        .path()
        .app_data_dir()
        .map_err(|error| error.to_string())?
        .join("settings.json");
    let previous_autostart = if key == "autostartEnabled" {
        Some(
            app.autolaunch()
                .is_enabled()
                .map_err(|error| error.to_string())?,
        )
    } else {
        None
    };
    let result = (|| -> Result<(), String> {
        if previous_autostart.is_some() {
            if enabled {
                app.autolaunch().enable()
            } else {
                app.autolaunch().disable()
            }
            .map_err(|error| error.to_string())?;
            updated.autostart_enabled = app
                .autolaunch()
                .is_enabled()
                .map_err(|error| error.to_string())?;
            if updated.autostart_enabled != enabled {
                return Err("OS autostart state did not change.".into());
            }
        }
        write_json(
            &path,
            &serde_json::to_string_pretty(&updated).map_err(|error| error.to_string())?,
        )
    })();
    if let Err(error) = result {
        if let Some(previous) = previous_autostart {
            let rollback = if previous {
                app.autolaunch().enable()
            } else {
                app.autolaunch().disable()
            };
            if let Err(rollback_error) = rollback {
                return Err(format!(
                    "{error}; autostart rollback failed: {rollback_error}"
                ));
            }
            current.autostart_enabled = previous;
        }
        return Err(error);
    }
    *current = updated.clone();
    drop(current);
    crate::tray::sync(&app, &updated);
    let _ = app.emit("settings-changed", &updated);
    Ok(updated)
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn settings_persist_and_invalid_files_report_errors() {
        let directory =
            std::env::temp_dir().join(format!("horarium-settings-test-{}", std::process::id()));
        let path = directory.join("settings.json");
        assert_eq!(read(&path).unwrap(), Settings::default());
        let settings = Settings {
            sound_enabled: false,
            start_minimized: true,
            ..Settings::default()
        };
        write_json(&path, &serde_json::to_string(&settings).unwrap()).unwrap();
        assert_eq!(read(&path).unwrap(), settings);
        fs::write(&path, "broken JSON").unwrap();
        assert!(read(&path).is_err());
        fs::remove_dir_all(directory).unwrap();
    }

    #[test]
    fn defaults_and_partial_settings_are_backwards_compatible() {
        let settings: Settings = serde_json::from_str("{\"soundEnabled\":false}").unwrap();
        assert!(!settings.sound_enabled);
        assert!(settings.notifications_enabled);
        assert!(!settings.speech_enabled);
        assert!(!settings.autostart_enabled);
        assert!(!settings.start_minimized);
        assert_eq!(
            serde_json::from_str::<Settings>(&serde_json::to_string(&settings).unwrap()).unwrap(),
            settings
        );
        assert!(serde_json::from_str::<Settings>("{\"soundEnabled\":\"yes\"}").is_err());
    }
}
