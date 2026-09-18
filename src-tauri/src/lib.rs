use chrono::{Datelike, Duration, Local, NaiveDate, NaiveDateTime, NaiveTime};
use serde::Deserialize;
use std::{collections::{HashMap, HashSet}, sync::Mutex, thread, time::Duration as StdDuration};
use tauri::{
    menu::{Menu, MenuItem, PredefinedMenuItem},
    tray::TrayIconBuilder,
    AppHandle, Manager, State, WindowEvent,
};
use tauri_plugin_notification::NotificationExt;

#[derive(Clone, Deserialize)]
struct Lesson {
    start: String,
    end: String,
    lesson: String,
}

type WeeklySchedule = HashMap<String, Vec<Lesson>>;

struct SchedulerState {
    schedule: Mutex<WeeklySchedule>,
}

#[tauri::command]
fn update_schedule(state: State<'_, SchedulerState>, schedule: WeeklySchedule) {
    if let Ok(mut current_schedule) = state.schedule.lock() {
        *current_schedule = schedule;
    }
}

fn day_name(day: chrono::Weekday) -> &'static str {
    match day {
        chrono::Weekday::Mon => "Երկուշաբթի",
        chrono::Weekday::Tue => "Երեքշաբթի",
        chrono::Weekday::Wed => "Չորեքշաբթի",
        chrono::Weekday::Thu => "Հինգշաբթի",
        chrono::Weekday::Fri => "Ուրբաթ",
        chrono::Weekday::Sat => "Շաբաթ",
        chrono::Weekday::Sun => "Կիրակի",
    }
}

fn schedule_time(value: &str, date: NaiveDate) -> Option<NaiveDateTime> {
    NaiveTime::parse_from_str(value, "%H:%M")
        .ok()
        .map(|time| date.and_time(time))
}

fn start_scheduler(app: AppHandle) {
    thread::spawn(move || {
        let mut last_check: Option<NaiveDateTime> = None;
        let mut notified_events = HashSet::new();

        loop {
            let now = Local::now().naive_local();
            let previous_check = last_check;
            last_check = Some(now);
            let lessons = app
                .state::<SchedulerState>()
                .schedule
                .lock()
                .ok()
                .and_then(|schedule| schedule.get(day_name(Local::now().weekday())).cloned())
                .unwrap_or_default();

            for lesson in &lessons {
                let Some(start) = schedule_time(&lesson.start, now.date()) else { continue };
                let Some(end) = schedule_time(&lesson.end, now.date()) else { continue };
                let event_prefix = format!("{}:{}:{}", now.date(), lesson.start, lesson.lesson);
                let start_key = format!("{}:start", event_prefix);
                let start_alert = start - Duration::minutes(1);
                if now >= start_alert && now < end && !notified_events.contains(&start_key) {
                    notified_events.insert(start_key);
                    let message = if now >= start {
                        format!("«{}» դասն արդեն սկսվել է։", lesson.lesson)
                    } else {
                        format!("1 րոպեից սկսվում է «{}» դասը։", lesson.lesson)
                    };
                    let _ = app.notification().builder().title("Դասացուցակ").body(message).show();
                }

                let end_key = format!("{}:end", event_prefix);
                let end_was_crossed = previous_check.is_some_and(|previous| {
                    previous.date() == now.date() && previous < end && now >= end
                });
                if end_was_crossed && !notified_events.contains(&end_key) {
                    notified_events.insert(end_key);
                    let next_lesson = lessons.iter().filter_map(|next| {
                        let next_start = schedule_time(&next.start, now.date())?;
                        (next_start > end).then_some((next_start, next.lesson.as_str()))
                    }).min_by_key(|(next_start, _)| *next_start);
                    let next_text = next_lesson
                        .map(|(_, name)| format!(" Հաջորդը՝ «{}»։", name))
                        .unwrap_or_else(|| " Այլ դաս այսօր չկա։".to_string());
                    let message = format!("«{}» դասը ավարտվեց։{}", lesson.lesson, next_text);
                    let _ = app.notification().builder().title("Դասացուցակ").body(message).show();
                }
            }

            thread::sleep(StdDuration::from_secs(30));
        }
    });
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .manage(SchedulerState {
            schedule: Mutex::new(HashMap::new()),
        })
        .invoke_handler(tauri::generate_handler![update_schedule])
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
            start_scheduler(app.handle().clone());
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
