use crate::settings::{Settings, SettingsState};
use rodio::{buffer::SamplesBuffer, OutputStreamBuilder, Sink};
use std::{
    sync::Mutex,
    thread,
    time::{Duration, Instant},
};
use tauri::{AppHandle, Manager};

static PLAYBACK: Mutex<()> = Mutex::new(());
const BELL: &[u8] = include_bytes!("../assets/bell.wav");

fn enabled(settings: &Settings) -> bool {
    settings.notifications_enabled && settings.sound_enabled
}

// The bundled generator produces 16-bit mono PCM at 22050 Hz. Its format is
// checked below; no general-purpose codec or external player is needed.
fn bell_samples() -> Vec<f32> {
    BELL[44..]
        .chunks_exact(2)
        .map(|bytes| i16::from_le_bytes([bytes[0], bytes[1]]) as f32 / 32768.0)
        .collect()
}

fn play_native() -> Result<(), String> {
    let stream = OutputStreamBuilder::open_default_stream()
        .map_err(|error| format!("Could not open audio output: {error}"))?;
    let sink = Sink::connect_new(stream.mixer());
    sink.append(SamplesBuffer::new(1, 22_050, bell_samples()));
    // A disconnected or stalled output must not keep the playback lock forever.
    let deadline = Instant::now() + Duration::from_secs(5);
    while !sink.empty() {
        if Instant::now() >= deadline {
            sink.stop();
            return Err("Audio output timed out.".into());
        }
        thread::sleep(Duration::from_millis(20));
    }
    Ok(())
}

#[tauri::command]
pub async fn play_bell(app: AppHandle) -> Result<(), String> {
    tauri::async_runtime::spawn_blocking(move || {
        let Ok(_guard) = PLAYBACK.try_lock() else {
            return Ok(());
        };
        let settings = app
            .state::<SettingsState>()
            .0
            .lock()
            .map_err(|error| error.to_string())?
            .clone();
        if !enabled(&settings) {
            return Ok(());
        }
        play_native()
    })
    .await
    .map_err(|error| error.to_string())?
}

pub fn ring(app: AppHandle) {
    tauri::async_runtime::spawn(async move {
        if let Err(error) = play_bell(app).await {
            eprintln!("Could not play bell: {error}");
        }
    });
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn disabled_sound_or_notifications_never_plays() {
        let mut settings = Settings::default();
        assert!(enabled(&settings));
        settings.sound_enabled = false;
        assert!(!enabled(&settings));
        settings.sound_enabled = true;
        settings.notifications_enabled = false;
        assert!(!enabled(&settings));
    }
    #[test]
    fn bundled_bell_is_valid_non_silent_pcm() {
        assert_eq!(&BELL[..4], b"RIFF");
        assert_eq!(&BELL[8..12], b"WAVE");
        assert_eq!(&BELL[12..16], b"fmt ");
        assert_eq!(&BELL[36..40], b"data");
        assert_eq!(u16::from_le_bytes(BELL[22..24].try_into().unwrap()), 1);
        assert_eq!(u32::from_le_bytes(BELL[24..28].try_into().unwrap()), 22_050);
        assert_eq!(bell_samples().len(), 44_100);
        assert!(bell_samples()
            .iter()
            .all(|sample| sample.is_finite() && sample.abs() < 1.0));
        assert_eq!(u16::from_le_bytes(BELL[20..22].try_into().unwrap()), 1);
        assert_eq!(u16::from_le_bytes(BELL[34..36].try_into().unwrap()), 16);
        let samples: Vec<i16> = BELL[44..]
            .chunks_exact(2)
            .map(|bytes| i16::from_le_bytes([bytes[0], bytes[1]]))
            .collect();
        assert!(samples.iter().any(|sample| sample.abs() > 3000));
        assert!(samples.iter().all(|sample| sample.abs() < 20000));
        assert!(samples[samples.len() - 100..]
            .iter()
            .all(|sample| *sample == 0));
    }
}
