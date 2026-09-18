use serde::{Deserialize, Serialize};
use std::collections::HashMap;

#[derive(Clone, Debug, Deserialize, Serialize)]
pub struct Lesson {
    pub start: String,
    pub end: String,
    pub lesson: String,
}

pub type WeeklySchedule = HashMap<String, Vec<Lesson>>;
