use std::{fs, io::Write, path::Path};

pub fn write_json(path: &Path, data: &str) -> Result<(), String> {
    serde_json::from_str::<serde_json::Value>(data).map_err(|error| error.to_string())?;
    let parent = path.parent().ok_or("Invalid data path")?;
    fs::create_dir_all(parent).map_err(|error| error.to_string())?;
    let mut file = tempfile::NamedTempFile::new_in(parent).map_err(|error| error.to_string())?;
    file.write_all(data.as_bytes())
        .map_err(|error| error.to_string())?;
    file.as_file()
        .sync_all()
        .map_err(|error| error.to_string())?;
    file.persist(path).map_err(|error| error.to_string())?;
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn cache_replaces_previous_json_and_keeps_it_on_invalid_write() {
        let directory =
            std::env::temp_dir().join(format!("horarium-cache-test-{}", std::process::id()));
        let path = directory.join("schedule.json");
        write_json(&path, "{}").unwrap();
        write_json(&path, "{\"Երկուշաբթի\":[]}").unwrap();
        assert!(write_json(&path, "invalid").is_err());
        assert_eq!(fs::read_to_string(&path).unwrap(), "{\"Երկուշաբթի\":[]}");
        fs::remove_dir_all(directory).unwrap();
    }
}
