use crate::storage::write_json;
use serde::{Deserialize, Serialize};
use std::{fs, path::Path, sync::Mutex};
use tauri::{AppHandle, Emitter, Manager};

#[derive(Clone, Debug, Deserialize, Serialize, PartialEq)]
#[serde(default, rename_all = "camelCase")]
pub struct Settings {
    pub notifications_enabled: bool,
    pub sound_enabled: bool,
    pub speech_enabled: bool,
}

impl Default for Settings {
    fn default() -> Self {
        Self {
            notifications_enabled: true,
            sound_enabled: true,
            speech_enabled: false,
        }
    }
}

pub struct SettingsState(pub Mutex<Settings>);

pub fn read(path: &Path) -> Result<Settings, String> {
    match fs::read_to_string(path) {
        Ok(data) => {
            let value: serde_json::Value =
                serde_json::from_str(&data).map_err(|e| e.to_string())?;
            let object = value.as_object().ok_or("Invalid settings")?;
            if object.keys().any(|key| {
                ![
                    "notificationsEnabled",
                    "soundEnabled",
                    "speechEnabled",
                    "autostartEnabled",
                    "startMinimized",
                ]
                .contains(&key.as_str())
            }) {
                return Err("Unknown settings format; file preserved".into());
            }
            serde_json::from_value(value).map_err(|error| error.to_string())
        }
        Err(error) if error.kind() == std::io::ErrorKind::NotFound => Ok(Settings::default()),
        Err(error) => Err(error.to_string()),
    }
}

#[tauri::command]
pub fn get_settings(app: AppHandle) -> Result<Settings, String> {
    let path = app
        .path()
        .app_data_dir()
        .map_err(|e| e.to_string())?
        .join("settings.json");
    read(&path)?;
    let state = app.state::<SettingsState>();
    let settings = state.0.lock().map_err(|error| error.to_string())?;
    let updated = settings.clone();
    drop(settings);
    crate::tray::sync(&app, &updated);
    Ok(updated)
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
        _ => return Err(format!("Unknown setting: {key}")),
    }
    let path = app
        .path()
        .app_data_dir()
        .map_err(|error| error.to_string())?
        .join("settings.json");
    read(&path)?; // Do not overwrite corrupt or newer settings with defaults.
    write_json(
        &path,
        &serde_json::to_string_pretty(&updated).map_err(|error| error.to_string())?,
    )?;
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
            ..Settings::default()
        };
        write_json(&path, &serde_json::to_string(&settings).unwrap()).unwrap();
        assert_eq!(read(&path).unwrap(), settings);
        fs::write(&path, "broken JSON").unwrap();
        assert!(read(&path).is_err());
        fs::remove_dir_all(directory).unwrap();
    }

    #[test]
    fn legacy_startup_preferences_are_ignored() {
        let settings: Settings = serde_json::from_str(
            r#"{"autostartEnabled":false,"startMinimized":false,"soundEnabled":false}"#,
        )
        .unwrap();
        assert!(!settings.sound_enabled);
        let saved = serde_json::to_value(settings).unwrap();
        assert!(saved.get("autostartEnabled").is_none());
        assert!(saved.get("startMinimized").is_none());
    }

    #[test]
    fn defaults_and_partial_settings_are_backwards_compatible() {
        let settings: Settings = serde_json::from_str("{\"soundEnabled\":false}").unwrap();
        assert!(!settings.sound_enabled);
        assert!(settings.notifications_enabled);
        assert!(!settings.speech_enabled);
        assert_eq!(
            serde_json::from_str::<Settings>(&serde_json::to_string(&settings).unwrap()).unwrap(),
            settings
        );
        assert!(serde_json::from_str::<Settings>("{\"soundEnabled\":\"yes\"}").is_err());
    }
    #[test]
    fn newer_settings_and_legacy_preferences_are_preserved() {
        let directory = tempfile::tempdir().unwrap();
        let path = directory.path().join("settings.json");
        let newer = r#"{"version":99,"soundEnabled":false}"#;
        fs::write(&path, newer).unwrap();
        assert!(read(&path).is_err());
        assert_eq!(fs::read_to_string(&path).unwrap(), newer);
        fs::write(&path, r#"{"notificationsEnabled":false,"soundEnabled":false,"speechEnabled":true,"startMinimized":false}"#).unwrap();
        let settings = read(&path).unwrap();
        assert!(!settings.notifications_enabled);
        assert!(!settings.sound_enabled);
        assert!(settings.speech_enabled);
    }
}
