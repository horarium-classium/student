use crate::{audio, model::WeeklySchedule, settings::SettingsState};
#[cfg(test)]
use chrono::NaiveDateTime;
use chrono::{DateTime, Datelike, Duration, NaiveDate, NaiveTime, TimeZone, Utc};
use std::{collections::HashSet, sync::Mutex, thread, time::Duration as StdDuration};
use tauri::{AppHandle, Emitter, Manager};
use tauri_plugin_notification::NotificationExt;

pub struct SchedulerState(pub Mutex<Runtime>);
#[derive(Default)]
pub struct Runtime {
    pub request: u64,
    record: Option<crate::publication::Record>,
    engine: Scheduler,
    generation: u64,
}
impl Runtime {
    pub fn identity(&self) -> Option<String> {
        self.record.as_ref().map(|r| r.identity())
    }
    pub fn source(&self) -> String {
        format!(
            "{}:{}",
            self.generation,
            self.record
                .as_ref()
                .map(|r| r.identity())
                .unwrap_or_default()
        )
    }
    pub fn activate(&mut self, record: Option<crate::publication::Record>) {
        let identity = |r: &Option<crate::publication::Record>| {
            r.as_ref().and_then(|r| {
                r.publication
                    .as_ref()
                    .map(|p| format!("{}:{}", r.identity(), p.timezone))
            })
        };
        let empty = record
            .as_ref()
            .and_then(|r| r.publication.as_ref())
            .is_none_or(|p| p.schedule.values().all(Vec::is_empty));
        if identity(&self.record) != identity(&record) || empty {
            self.engine = Scheduler::default();
        }
        self.record = record;
        self.generation += 1;
        audio::cancel_pending();
    }
}
pub fn validate_schedule(schedule: &WeeklySchedule) -> Result<(), String> {
    for (day, lessons) in schedule {
        if ![
            "Երկուշաբթի",
            "Երեքշաբթի",
            "Չորեքշաբթի",
            "Հինգշաբթի",
            "Ուրբաթ",
            "Շաբաթ",
            "Կիրակի",
        ]
        .contains(&day.as_str())
        {
            return Err("Invalid weekday".into());
        }
        let mut sorted = lessons.iter().collect::<Vec<_>>();
        sorted.sort_by_key(|lesson| &lesson.start);
        let mut previous_end = "";
        for lesson in sorted {
            let valid_time = |v: &str| {
                v.len() == 5
                    && v.as_bytes()[2] == b':'
                    && NaiveTime::parse_from_str(v, "%H:%M").is_ok()
                    && v.bytes()
                        .enumerate()
                        .all(|(i, c)| i == 2 || c.is_ascii_digit())
            };
            if !valid_time(&lesson.start)
                || !valid_time(&lesson.end)
                || lesson.start >= lesson.end
                || lesson.start.as_str() < previous_end
                || lesson.lesson.trim().is_empty()
            {
                return Err("Invalid or overlapping lesson".into());
            }
            previous_end = &lesson.end;
        }
    }
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

fn schedule_time(value: &str, date: NaiveDate, timezone: chrono_tz::Tz) -> Option<DateTime<Utc>> {
    let time = NaiveTime::parse_from_str(value, "%H:%M").ok()?;
    // Missing local times are skipped; repeated local times use the earlier instant.
    timezone
        .from_local_datetime(&date.and_time(time))
        .earliest()
        .map(|time| time.with_timezone(&Utc))
}

#[derive(Clone, Debug, serde::Serialize)]
#[serde(rename_all = "camelCase")]
struct SpeechNotification {
    kind: &'static str,
    body: String,
}

#[derive(Default)]
struct Scheduler {
    last_check: Option<DateTime<Utc>>,
    notified_events: HashSet<(NaiveDate, String, String, String, bool)>,
}

impl Scheduler {
    #[cfg(test)]
    fn tick(&mut self, schedule: &WeeklySchedule, now: NaiveDateTime) -> Vec<SpeechNotification> {
        self.tick_zoned(schedule, now.and_utc(), chrono_tz::UTC)
    }
    fn tick_zoned(
        &mut self,
        schedule: &WeeklySchedule,
        now: DateTime<Utc>,
        timezone: chrono_tz::Tz,
    ) -> Vec<SpeechNotification> {
        let previous = self.last_check.replace(now);
        let today = now.with_timezone(&timezone).date_naive();
        let tomorrow = today.succ_opt().unwrap_or(today);
        if previous.is_none_or(|date| date.with_timezone(&timezone).date_naive() != today) {
            // Retain tomorrow's midnight pre-alert, but discard all past-day keys.
            self.notified_events
                .retain(|key| key.0 >= today && key.0 <= tomorrow);
        }
        let mut messages = Vec::new();
        let mut dates = Vec::new();
        if let Some(last) =
            previous.filter(|last| last.with_timezone(&timezone).date_naive() < today)
        {
            dates.push(last.with_timezone(&timezone).date_naive());
        }
        dates.extend([today, tomorrow]);
        for date in dates {
            let Some(lessons) = schedule.get(day_name(date.weekday())) else {
                continue;
            };
            for lesson in lessons {
                let Some(start) = schedule_time(&lesson.start, date, timezone) else {
                    continue;
                };
                let Some(end) = schedule_time(&lesson.end, date, timezone) else {
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
                    messages.push(SpeechNotification {
                        kind: if now >= start {
                            "started"
                        } else {
                            "startingSoon"
                        },
                        body: if now >= start {
                            format!("«{}» դասն արդեն սկսվել է։", lesson.lesson)
                        } else {
                            format!("1 րոպեից սկսվում է «{}» դասը։", lesson.lesson)
                        },
                    });
                }
                // Catch up missed ends on the last observed day and today, including midnight.
                if date <= today
                    && previous.is_some_and(|last| last < end && now >= end)
                    && self.notified_events.insert(key(true))
                {
                    if date < today {
                        messages.push(SpeechNotification {
                            kind: "ended",
                            body: format!("«{}» դասը ավարտվեց ({})։", lesson.lesson, date),
                        });
                        continue;
                    }
                    let next = lessons
                        .iter()
                        .filter_map(|next| {
                            let next_start = schedule_time(&next.start, date, timezone)?;
                            let next_end = schedule_time(&next.end, date, timezone)?;
                            (next_start >= end && next_start < next_end)
                                .then_some((next_start, next.lesson.as_str()))
                        })
                        .min_by_key(|(start, _)| *start);
                    let next_text = next
                        .map(|(_, name)| format!(" Հաջորդը՝ «{}»։", name))
                        .unwrap_or_else(|| " Այլ դաս այսօր չկա։".to_string());
                    messages.push(SpeechNotification {
                        kind: "ended",
                        body: format!("«{}» դասը ավարտվեց։{}", lesson.lesson, next_text),
                    });
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
        loop {
            // Keep the source lock through delivery: a completed switch cannot be
            // followed by a notification from a cloned, obsolete schedule.
            let state = app.state::<SchedulerState>();
            if let Ok(mut runtime) = state.0.lock() {
                let settings = app
                    .state::<SettingsState>()
                    .0
                    .lock()
                    .map(|s| s.clone())
                    .unwrap_or_default();
                if let Some(publication) =
                    runtime.record.as_ref().and_then(|r| r.publication.clone())
                {
                    if let Ok(timezone) = publication.timezone.parse::<chrono_tz::Tz>() {
                        for message in
                            runtime
                                .engine
                                .tick_zoned(&publication.schedule, Utc::now(), timezone)
                        {
                            if !settings.notifications_enabled {
                                continue;
                            }
                            let _ = app
                                .notification()
                                .builder()
                                .title("Դասացուցակ")
                                .body(&message.body)
                                .show();
                            if settings.speech_enabled {
                                let _ = app.emit("speak-notification", serde_json::json!({"source": runtime.source(), "kind": message.kind, "body": message.body}));
                            }
                            audio::ring(app.clone());
                        }
                    }
                }
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
    fn speech_payload_has_explicit_event_kind_and_armenian_body() {
        let mut engine = Scheduler::default();
        let soon = engine.tick(&schedule(), at(21, 8, 59));
        let payload = serde_json::to_value(&soon[0]).unwrap();
        assert_eq!(payload["kind"], "startingSoon");
        assert_eq!(payload["body"], "1 րոպեից սկսվում է «Մաթեմատիկա» դասը։");
        let messages = engine.tick(&schedule(), at(21, 10, 0));
        assert_eq!(messages[0].kind, "ended");
        assert_eq!(messages[1].kind, "started");
    }

    #[test]
    fn pre_alert_window_and_duplicate_suppression() {
        let mut engine = Scheduler::default();
        assert!(engine.tick(&schedule(), at(21, 8, 58)).is_empty());
        assert_eq!(
            engine
                .tick(&schedule(), at(21, 8, 59))
                .iter()
                .map(|m| m.body.as_str())
                .collect::<Vec<_>>(),
            ["1 րոպեից սկսվում է «Մաթեմատիկա» դասը։"]
        );
        assert!(engine.tick(&schedule(), at(21, 9, 0)).is_empty());
        assert!(engine.tick(&schedule(), at(21, 9, 20)).is_empty());
    }

    #[test]
    fn startup_mid_lesson_only_alerts_once() {
        let mut engine = Scheduler::default();
        assert_eq!(
            engine
                .tick(&schedule(), at(21, 9, 30))
                .iter()
                .map(|m| m.body.as_str())
                .collect::<Vec<_>>(),
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
        assert!(messages[0].body.contains("ավարտվեց։ Հաջորդը՝ «Ֆիզիկա»"));
        assert!(messages[1].body.contains("արդեն սկսվել է"));
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
            .any(|message| message.body.contains("Հաջորդը՝ «Ֆիզիկա»")));
    }

    #[test]
    fn wake_on_new_day_catches_today_but_not_previous_day() {
        let mut engine = Scheduler::default();
        engine.tick(&schedule(), at(20, 23, 0));
        let messages = engine.tick(&schedule(), at(21, 11, 30));
        assert_eq!(messages.len(), 2);
        assert!(messages
            .iter()
            .all(|message| message.body.contains("ավարտվեց")));
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
        assert!(messages[0].body.contains("2026-09-21"));
        assert!(engine.notified_events.is_empty());
        assert!(engine.tick(&schedule, at(22, 0, 2)).is_empty());
    }
    #[test]
    fn school_timezone_and_dst_use_real_instants() {
        let mut engine = Scheduler::default();
        let tz = "Asia/Yerevan".parse().unwrap();
        assert_eq!(
            engine
                .tick_zoned(&schedule(), at(21, 5, 30).and_utc(), tz)
                .len(),
            1
        );
        let ny = chrono_tz::America::New_York;
        let spring = NaiveDate::from_ymd_opt(2026, 3, 8).unwrap();
        assert!(schedule_time("02:30", spring, ny).is_none());
        let fall = NaiveDate::from_ymd_opt(2026, 11, 1).unwrap();
        assert_eq!(
            schedule_time("01:30", fall, ny).unwrap(),
            fall.and_hms_opt(5, 30, 0).unwrap().and_utc()
        );
        let repeated = [(
            "Կիրակի".into(),
            vec![Lesson {
                start: "01:00".into(),
                end: "01:45".into(),
                lesson: "Դաս".into(),
            }],
        )]
        .into();
        let mut engine = Scheduler::default();
        assert_eq!(
            engine
                .tick_zoned(&repeated, fall.and_hms_opt(5, 15, 0).unwrap().and_utc(), ny)
                .len(),
            1
        );
        assert_eq!(
            engine
                .tick_zoned(&repeated, fall.and_hms_opt(6, 15, 0).unwrap().and_utc(), ny)
                .len(),
            1
        ); // missed end, no repeated start
        assert!(engine
            .tick_zoned(&repeated, fall.and_hms_opt(6, 30, 0).unwrap().and_utc(), ny)
            .is_empty());
        let skipped = [(
            "Կիրակի".into(),
            vec![Lesson {
                start: "02:30".into(),
                end: "03:30".into(),
                lesson: "Դաս".into(),
            }],
        )]
        .into();
        assert!(Scheduler::default()
            .tick_zoned(
                &skipped,
                spring.and_hms_opt(7, 15, 0).unwrap().and_utc(),
                ny
            )
            .is_empty());
    }

    #[test]
    fn source_switch_and_empty_publication_reset_old_reminders() {
        let record = crate::publication::tests::record();
        let mut runtime = Runtime::default();
        runtime.activate(Some(record.clone()));
        runtime.engine.tick(&schedule(), at(21, 9, 30));
        runtime.activate(Some(record.clone()));
        assert!(runtime.engine.tick(&schedule(), at(21, 9, 31)).is_empty());
        let mut other = record.clone();
        other.join_code = "TQVA".into();
        other.publication.as_mut().unwrap().join_code = other.join_code.clone();
        runtime.activate(Some(other));
        assert!(runtime.engine.last_check.is_none());
        assert!(runtime.engine.notified_events.is_empty());
        assert_eq!(runtime.engine.tick(&schedule(), at(21, 9, 31)).len(), 1);
        let mut empty = record.clone();
        empty.publication.as_mut().unwrap().schedule.clear();
        runtime.activate(Some(empty));
        assert!(runtime.engine.notified_events.is_empty());
        assert!(runtime.engine.last_check.is_none());
        runtime.activate(None);
        assert!(runtime.record.is_none());
    }

    #[test]
    fn native_input_validation_rejects_invalid_schedules() {
        assert!(validate_schedule(&schedule()).is_ok());
        let mut invalid = schedule();
        invalid.get_mut("Երկուշաբթի").unwrap()[0].start = "9:00".into();
        assert!(validate_schedule(&invalid).is_err());
        invalid = schedule();
        invalid.get_mut("Երկուշաբթի").unwrap()[0].end = "10:15".into();
        assert!(validate_schedule(&invalid).is_err());
        invalid.insert("Monday".into(), vec![]);
        assert!(validate_schedule(&invalid).is_err());
    }
    #[test]
    fn next_lesson_skips_a_nonexistent_dst_endpoint() {
        let day = NaiveDate::from_ymd_opt(2026, 3, 8).unwrap();
        let schedule = [(
            "Կիրակի".into(),
            vec![
                Lesson {
                    start: "00:00".into(),
                    end: "00:30".into(),
                    lesson: "Առաջին".into(),
                },
                Lesson {
                    start: "01:30".into(),
                    end: "02:30".into(),
                    lesson: "Բաց թողնվող".into(),
                },
                Lesson {
                    start: "03:30".into(),
                    end: "04:00".into(),
                    lesson: "Հաջորդ".into(),
                },
            ],
        )]
        .into();
        let mut engine = Scheduler::default();
        engine.tick_zoned(
            &schedule,
            day.and_hms_opt(5, 15, 0).unwrap().and_utc(),
            chrono_tz::America::New_York,
        );
        let messages = engine.tick_zoned(
            &schedule,
            day.and_hms_opt(5, 30, 0).unwrap().and_utc(),
            chrono_tz::America::New_York,
        );
        assert_eq!(messages.len(), 1);
        assert!(messages[0].body.contains("Հաջորդը՝ «Հաջորդ»"));
    }
}
