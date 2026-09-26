use crate::{model::WeeklySchedule, scheduler::SchedulerState, storage::write_json};
use serde::{Deserialize, Serialize};
use std::{fs, path::Path};
use tauri::{AppHandle, Emitter, Manager};

pub const FILE: &str = "publication-v2.json";
#[derive(Clone, Debug, Deserialize, Serialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct Publication {
    pub format_version: u32,
    pub public_id: String,
    pub revision: u64,
    pub published_at: String,
    pub school_name: String,
    pub class_name: String,
    pub timezone: String,
    pub schedule: WeeklySchedule,
}
#[derive(Clone, Debug, Deserialize, Serialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct Record {
    pub version: u32,
    pub environment: String,
    pub public_id: String,
    #[serde(deserialize_with = "required_publication")]
    pub publication: Option<Publication>,
}
fn required_publication<'de, D: serde::Deserializer<'de>>(
    deserializer: D,
) -> Result<Option<Publication>, D::Error> {
    Option::<Publication>::deserialize(deserializer)
}
pub fn valid_uuid(value: &str) -> bool {
    value.len() == 36
        && value.bytes().enumerate().all(|(i, ch)| {
            if [8, 13, 18, 23].contains(&i) {
                ch == b'-'
            } else {
                ch.is_ascii_hexdigit() && !ch.is_ascii_uppercase()
            }
        })
}
impl Record {
    pub fn identity(&self) -> String {
        format!("{}/{}", self.environment, self.public_id)
    }
    pub fn validate(&self) -> Result<(), String> {
        let url = tauri::Url::parse(&self.environment).map_err(|_| "Invalid environment")?;
        let local = matches!(url.host_str(), Some("localhost" | "127.0.0.1" | "[::1]"));
        if self.version != 2
            || !valid_uuid(&self.public_id)
            || !url.username().is_empty()
            || url.password().is_some()
            || url.query().is_some()
            || url.fragment().is_some()
            || url.origin().ascii_serialization() != self.environment
            || !(url.scheme() == "https" || (url.scheme() == "http" && local))
        {
            return Err("Invalid publication cache identity/version".into());
        }
        if let Some(p) = &self.publication {
            if p.format_version != 1
                || p.public_id != self.public_id
                || p.revision == 0
                || p.revision > 9_007_199_254_740_991
                || p.school_name.trim().is_empty()
                || p.class_name.trim().is_empty()
                || chrono::DateTime::parse_from_rfc3339(&p.published_at).is_err()
                || p.timezone.parse::<chrono_tz::Tz>().is_err()
            {
                return Err("Invalid publication metadata".into());
            }
            crate::scheduler::validate_schedule(&p.schedule)?;
        }
        Ok(())
    }
}
fn read_record(path: &Path) -> Result<Option<Record>, String> {
    match fs::read_to_string(path) {
        Ok(data) => {
            let record: Record = serde_json::from_str(&data).map_err(|error| error.to_string())?;
            record.validate()?;
            Ok(Some(record))
        }
        Err(error) if error.kind() == std::io::ErrorKind::NotFound => Ok(None),
        Err(error) => Err(error.to_string()),
    }
}
pub fn read(path: &Path) -> Result<Option<Record>, String> {
    let stored = read_record(path)?;
    let invalidated = read_record(&path.with_extension("invalidated.json"))?;
    if let Some(blocked) = invalidated {
        if blocked.publication.is_some() {
            return Err("Invalid invalidation record".into());
        }
        if stored
            .as_ref()
            .is_some_and(|old| old.identity() == blocked.identity())
        {
            return Ok(Some(blocked));
        }
    }
    Ok(stored)
}
fn persist(path: &Path, record: &Record) -> Result<(), String> {
    let data = serde_json::to_string(record).map_err(|e| e.to_string())?;
    let marker = path.with_extension("invalidated.json");
    if record.publication.is_none() {
        // Independent tombstone protects restart even if replacement of the old
        // cache file fails (e.g. Windows sharing/permissions). Either durable copy suffices.
        let marker_result = write_json(&marker, &data);
        let cache_result = write_json(path, &data);
        if marker_result.is_ok() || cache_result.is_ok() {
            return Ok(());
        }
        return Err("Could not persist invalidation in cache or tombstone".into());
    }
    write_json(path, &data)?;
    if read_record(&marker)?.is_some_and(|blocked| blocked.identity() == record.identity()) {
        // Keep blocking this source if removal fails; never claim successful activation.
        fs::remove_file(marker).map_err(|e| e.to_string())?;
    }
    Ok(())
}
#[tauri::command]
pub fn read_publication(app: AppHandle) -> Result<Option<Record>, String> {
    read(
        &app.path()
            .app_data_dir()
            .map_err(|e| e.to_string())?
            .join(FILE),
    )
}
#[tauri::command]
pub fn begin_publication_request(app: AppHandle) -> Result<u64, String> {
    let state = app.state::<SchedulerState>();
    let mut runtime = state.0.lock().map_err(|e| e.to_string())?;
    runtime.request += 1;
    Ok(runtime.request)
}
#[tauri::command]
pub fn commit_publication(
    app: AppHandle,
    token: u64,
    record: Record,
    cached: bool,
) -> Result<(), String> {
    let state = app.state::<SchedulerState>();
    let mut runtime = state.0.lock().map_err(|e| e.to_string())?;
    let path = app
        .path()
        .app_data_dir()
        .map_err(|e| e.to_string())?
        .join(FILE);
    let before = runtime.source();
    let result = commit(&mut runtime, &path, token, record, cached);
    if before != runtime.source() {
        let _ = app.emit("publication-source-changed", runtime.source());
    }
    result
}

fn commit(
    runtime: &mut crate::scheduler::Runtime,
    path: &Path,
    token: u64,
    record: Record,
    cached: bool,
) -> Result<(), String> {
    record.validate()?;
    if token != runtime.request {
        return Err("Stale publication request".into());
    }
    // Stop current reminders even if a concurrently damaged file cannot be read.
    if !cached
        && record.publication.is_none()
        && runtime.identity().as_deref() == Some(&record.identity())
    {
        runtime.activate(None);
    }
    let stored = read(path)?;
    if cached {
        if record.publication.is_none()
            || serde_json::to_value(&stored).ok() != serde_json::to_value(Some(&record)).ok()
        {
            return Err("Offline cache does not match saved class".into());
        }
    } else {
        if record.publication.is_none() {
            if stored
                .as_ref()
                .is_none_or(|old| old.identity() != record.identity())
            {
                return Err("Invalidation class mismatch".into());
            }
            runtime.activate(None);
        }
        // A failed connection leaves the previous class intact. No invalid/future
        // record is overwritten. Invalidation stops memory state before persistence.
        persist(path, &record)?;
    }
    runtime.activate(Some(record));
    Ok(())
}

#[cfg(test)]
pub mod tests {
    use super::*;
    pub fn record() -> Record {
        serde_json::from_value(serde_json::json!({
            "version": 2, "environment": "http://127.0.0.1:54321", "publicId": "aaaaaaaa-0000-0000-0000-000000000001",
            "publication": {"formatVersion":1,"publicId":"aaaaaaaa-0000-0000-0000-000000000001","revision":1,
                "publishedAt":"2026-09-26T10:00:00Z","schoolName":"Դպրոց","className":"5Ա","timezone":"Asia/Yerevan",
                "schedule":{"Երկուշաբթի":[{"start":"09:00","end":"10:00","lesson":"Դաս"}]}}
        })).unwrap()
    }
    #[test]
    fn native_cache_validation_and_persistent_invalidation() {
        let directory = tempfile::tempdir().unwrap();
        let path = directory.path().join(FILE);
        fs::write(
            directory.path().join("schedule-v1.json"),
            r#"{"Երկուշաբթի":[]}"#,
        )
        .unwrap();
        assert!(read(&path).unwrap().is_none()); // Never import the identity-free Gist cache.
        let mut current = record();
        current.validate().unwrap();
        write_json(&path, &serde_json::to_string(&current).unwrap()).unwrap();
        assert!(read(&path).unwrap().unwrap().publication.is_some());
        current.publication = None;
        write_json(&path, &serde_json::to_string(&current).unwrap()).unwrap();
        assert!(read(&path).unwrap().unwrap().publication.is_none());
        assert!(directory.path().join("schedule-v1.json").exists());
        for broken in ["broken", "{}", r#"{"version":99}"#] {
            fs::write(&path, broken).unwrap();
            assert!(read(&path).is_err());
            assert_eq!(fs::read_to_string(&path).unwrap(), broken);
        }
    }
    #[test]
    fn native_metadata_validation_rejects_wrong_class_timezone_and_version() {
        for field in ["publicId", "timezone", "publishedAt"] {
            let mut value = serde_json::to_value(record()).unwrap();
            value["publication"][field] = "invalid".into();
            assert!(serde_json::from_value::<Record>(value)
                .unwrap()
                .validate()
                .is_err());
        }
        let mut future = record();
        future.version = 99;
        assert!(future.validate().is_err());
        let mut empty = record();
        empty.publication.as_mut().unwrap().schedule.clear();
        assert!(empty.validate().is_ok());
    }
    #[test]
    fn commit_guards_source_storage_failure_and_stale_responses() {
        let directory = tempfile::tempdir().unwrap();
        let path = directory.path().join(FILE);
        let mut runtime = crate::scheduler::Runtime::default();
        runtime.request = 1;
        commit(&mut runtime, &path, 1, record(), false).unwrap();
        let original = fs::read_to_string(&path).unwrap();
        let mut other = record();
        other.public_id = "bbbbbbbb-0000-0000-0000-000000000002".into();
        other.publication.as_mut().unwrap().public_id = other.public_id.clone();
        assert!(commit(&mut runtime, &path, 1, other.clone(), true).is_err());
        runtime.request = 2;
        assert!(commit(&mut runtime, &path, 1, other.clone(), false).is_err());
        assert_eq!(fs::read_to_string(&path).unwrap(), original);
        // A path whose parent is a file reliably refuses writes on every OS.
        assert!(commit(
            &mut runtime,
            &path.join("impossible"),
            2,
            other.clone(),
            false
        )
        .is_err());
        assert_eq!(runtime.identity(), Some(record().identity()));
        commit(&mut runtime, &path, 2, other.clone(), false).unwrap();
        assert_eq!(runtime.identity(), Some(other.identity()));
        let mut unavailable = other;
        unavailable.publication = None;
        commit(&mut runtime, &path, 2, unavailable, false).unwrap();
        assert!(read(&path).unwrap().unwrap().publication.is_none());
        assert!(commit(&mut runtime, &path, 2, record(), true).is_err());
        let future = r#"{"version":99}"#;
        fs::write(&path, future).unwrap();
        assert!(commit(&mut runtime, &path, 2, record(), false).is_err());
        assert_eq!(fs::read_to_string(&path).unwrap(), future);
        let mut missing = serde_json::to_value(record()).unwrap();
        missing.as_object_mut().unwrap().remove("publication");
        assert!(serde_json::from_value::<Record>(missing).is_err());
    }
    #[test]
    fn invalidation_tombstone_blocks_old_cache_until_valid_publication() {
        let directory = tempfile::tempdir().unwrap();
        let path = directory.path().join(FILE);
        let valid = record();
        persist(&path, &valid).unwrap();
        let mut blocked = valid.clone();
        blocked.publication = None;
        // Simulate interrupted replacement: durable marker alongside old cache.
        write_json(
            &path.with_extension("invalidated.json"),
            &serde_json::to_string(&blocked).unwrap(),
        )
        .unwrap();
        assert!(read(&path).unwrap().unwrap().publication.is_none());
        persist(&path, &valid).unwrap();
        assert!(read(&path).unwrap().unwrap().publication.is_some());
        assert!(!path.with_extension("invalidated.json").exists());
    }
}
