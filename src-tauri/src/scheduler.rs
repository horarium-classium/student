use crate::{audio, model::WeeklySchedule, settings::SettingsState};
use chrono::{Datelike, Duration, Local, NaiveDate, NaiveDateTime, NaiveTime};
use std::{collections::HashSet, sync::Mutex, thread, time::Duration as StdDuration};
use tauri::{AppHandle, Emitter, Manager, State};
use tauri_plugin_notification::NotificationExt;

pub struct SchedulerState {
    pub schedule: Mutex<WeeklySchedule>,
}

#[tauri::command]
pub fn update_schedule(
    state: State<'_, SchedulerState>,
    schedule: WeeklySchedule,
) -> Result<(), String> {
    *state.schedule.lock().map_err(|error| error.to_string())? = schedule;
    Ok(())
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

#[derive(Default)]
struct Scheduler {
    last_check: Option<NaiveDateTime>,
    notified_events: HashSet<(NaiveDate, String, String, String, bool)>,
}

impl Scheduler {
    fn tick(&mut self, schedule: &WeeklySchedule, now: NaiveDateTime) -> Vec<String> {
        let previous = self.last_check.replace(now);
        let today = now.date();
        let tomorrow = today.succ_opt().unwrap_or(today);
        if previous.is_none_or(|date| date.date() != today) {
            // Retain tomorrow's midnight pre-alert, but discard all past-day keys.
            self.notified_events
                .retain(|key| key.0 >= today && key.0 <= tomorrow);
        }
        let mut messages = Vec::new();
        let mut dates = Vec::new();
        if let Some(last) = previous.filter(|last| last.date() < today) {
            dates.push(last.date());
        }
        dates.extend([today, tomorrow]);
        for date in dates {
            let Some(lessons) = schedule.get(day_name(date.weekday())) else {
                continue;
            };
            for lesson in lessons {
                let Some(start) = schedule_time(&lesson.start, date) else {
                    continue;
                };
                let Some(end) = schedule_time(&lesson.end, date) else {
                    continue;
                };
                if start >= end {
                    continue;
                }
                let key = |is_end| {
                    (
                        date,
                        lesson.start.clone(),
                        lesson.end.clone(),
                        lesson.lesson.clone(),
                        is_end,
                    )
                };
                if now >= start - Duration::minutes(1)
                    && now < end
                    && self.notified_events.insert(key(false))
                {
                    messages.push(if now >= start {
                        format!("«{}» դասն արդեն սկսվել է։", lesson.lesson)
                    } else {
                        format!("1 րոպեից սկսվում է «{}» դասը։", lesson.lesson)
                    });
                }
                // Catch up missed ends on the last observed day and today, including midnight.
                if date <= today
                    && previous.is_some_and(|last| last < end && now >= end)
                    && self.notified_events.insert(key(true))
                {
                    if date < today {
                        messages.push(format!("«{}» դասը ավարտվեց ({})։", lesson.lesson, date));
                        continue;
                    }
                    let next = lessons
                        .iter()
                        .filter_map(|next| {
                            let next_start = schedule_time(&next.start, date)?;
                            (next_start >= end).then_some((next_start, next.lesson.as_str()))
                        })
                        .min_by_key(|(start, _)| *start);
                    let next_text = next
                        .map(|(_, name)| format!(" Հաջորդը՝ «{}»։", name))
                        .unwrap_or_else(|| " Այլ դաս այսօր չկա։".to_string());
                    messages.push(format!("«{}» դասը ավարտվեց։{}", lesson.lesson, next_text));
                }
            }
        }
        self.notified_events
            .retain(|key| key.0 >= today && key.0 <= tomorrow);
        messages
    }
}

pub fn start_scheduler(app: AppHandle) {
    thread::spawn(move || {
        let mut scheduler = Scheduler::default();
        loop {
            let schedule = app
                .state::<SchedulerState>()
                .schedule
                .lock()
                .map(|schedule| schedule.clone())
                .unwrap_or_default();
            let settings = app
                .state::<SettingsState>()
                .0
                .lock()
                .map(|settings| settings.clone())
                .unwrap_or_default();
            for message in scheduler.tick(&schedule, Local::now().naive_local()) {
                if !settings.notifications_enabled {
                    continue;
                }
                let _ = app
                    .notification()
                    .builder()
                    .title("Դասացուցակ")
                    .body(&message)
                    .show();
                if settings.speech_enabled {
                    let _ = app.emit("speak-notification", &message);
                }
                audio::ring(app.clone());
            }
            thread::sleep(StdDuration::from_secs(10));
        }
    });
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::model::Lesson;

    fn at(day: u32, hour: u32, minute: u32) -> NaiveDateTime {
        NaiveDate::from_ymd_opt(2026, 9, day)
            .unwrap()
            .and_hms_opt(hour, minute, 0)
            .unwrap()
    }
    fn schedule() -> WeeklySchedule {
        [(
            "Երկուշաբթի".into(),
            vec![
                Lesson {
                    start: "09:00".into(),
                    end: "10:00".into(),
                    lesson: "Մաթեմատիկա".into(),
                },
                Lesson {
                    start: "10:00".into(),
                    end: "11:00".into(),
                    lesson: "Ֆիզիկա".into(),
                },
            ],
        )]
        .into()
    }

    #[test]
    fn pre_alert_window_and_duplicate_suppression() {
        let mut engine = Scheduler::default();
        assert!(engine.tick(&schedule(), at(21, 8, 58)).is_empty());
        assert_eq!(
            engine.tick(&schedule(), at(21, 8, 59)),
            ["1 րոպեից սկսվում է «Մաթեմատիկա» դասը։"]
        );
        assert!(engine.tick(&schedule(), at(21, 9, 0)).is_empty());
        assert!(engine.tick(&schedule(), at(21, 9, 20)).is_empty());
    }

    #[test]
    fn startup_mid_lesson_only_alerts_once() {
        let mut engine = Scheduler::default();
        assert_eq!(
            engine.tick(&schedule(), at(21, 9, 30)),
            ["«Մաթեմատիկա» դասն արդեն սկսվել է։"]
        );
        assert!(engine.tick(&schedule(), at(21, 9, 31)).is_empty());
    }

    #[test]
    fn sleep_wake_catches_start_and_end_including_adjacent_next_lesson() {
        let mut engine = Scheduler::default();
        engine.tick(&schedule(), at(21, 8, 0));
        let messages = engine.tick(&schedule(), at(21, 10, 15));
        assert_eq!(messages.len(), 2);
        assert!(messages[0].contains("ավարտվեց։ Հաջորդը՝ «Ֆիզիկա»"));
        assert!(messages[1].contains("արդեն սկսվել է"));
        assert!(engine.tick(&schedule(), at(21, 10, 16)).is_empty());
        assert_eq!(engine.tick(&schedule(), at(21, 11, 0)).len(), 1);
        assert!(engine.tick(&schedule(), at(21, 11, 1)).is_empty());
    }

    #[test]
    fn new_day_cleans_keys_and_does_not_replay_old_days() {
        let mut engine = Scheduler::default();
        engine.tick(&schedule(), at(21, 9, 30));
        assert!(!engine.notified_events.is_empty());
        engine.tick(&schedule(), at(21, 11, 30));
        assert!(engine.tick(&schedule(), at(22, 9, 30)).is_empty());
        assert!(engine.notified_events.is_empty());
    }

    #[test]
    fn midnight_pre_alert_is_not_repeated_after_day_rollover() {
        let schedule = [(
            "Երեքշաբթի".into(),
            vec![Lesson {
                start: "00:00".into(),
                end: "01:00".into(),
                lesson: "Դաս".into(),
            }],
        )]
        .into();
        let mut engine = Scheduler::default();
        assert_eq!(engine.tick(&schedule, at(21, 23, 59)).len(), 1);
        assert!(engine.tick(&schedule, at(22, 0, 0)).is_empty());
        assert_eq!(engine.tick(&schedule, at(22, 1, 0)).len(), 1);
    }

    #[test]
    fn clock_rollback_does_not_repeat_delivered_events() {
        let mut engine = Scheduler::default();
        engine.tick(&schedule(), at(21, 9, 30));
        engine.tick(&schedule(), at(21, 8, 30));
        assert!(engine.tick(&schedule(), at(21, 9, 30)).is_empty());
    }

    #[test]
    fn next_lesson_is_the_earliest_even_with_unsorted_input() {
        let mut schedule = schedule();
        schedule.get_mut("Երկուշաբթի").unwrap().reverse();
        let mut engine = Scheduler::default();
        engine.tick(&schedule, at(21, 9, 30));
        let messages = engine.tick(&schedule, at(21, 10, 0));
        assert!(messages
            .iter()
            .any(|message| message.contains("Հաջորդը՝ «Ֆիզիկա»")));
    }

    #[test]
    fn wake_on_new_day_catches_today_but_not_previous_day() {
        let mut engine = Scheduler::default();
        engine.tick(&schedule(), at(20, 23, 0));
        let messages = engine.tick(&schedule(), at(21, 11, 30));
        assert_eq!(messages.len(), 2);
        assert!(messages.iter().all(|message| message.contains("ավարտվեց")));
        assert!(engine.tick(&schedule(), at(21, 11, 31)).is_empty());
    }
    #[test]
    fn sleep_across_midnight_reports_missed_end_once_and_cleans_old_keys() {
        let schedule = [(
            "Երկուշաբթի".into(),
            vec![Lesson {
                start: "23:00".into(),
                end: "23:59".into(),
                lesson: "Դաս".into(),
            }],
        )]
        .into();
        let mut engine = Scheduler::default();
        engine.tick(&schedule, at(21, 23, 30));
        let messages = engine.tick(&schedule, at(22, 0, 1));
        assert_eq!(messages.len(), 1);
        assert!(messages[0].contains("2026-09-21"));
        assert!(engine.notified_events.is_empty());
        assert!(engine.tick(&schedule, at(22, 0, 2)).is_empty());
    }
}
