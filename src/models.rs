use serde::{Deserialize, Serialize};
use serde_json::Value;
use std::collections::BTreeMap;

#[derive(Clone, Debug, Serialize, Deserialize)]
pub struct Org {
    pub id: String,
    pub name: String,
    pub created_at: String,
}
#[derive(Clone, Debug, Serialize, Deserialize)]
pub struct OrgInviteToken {
    pub id: String,
    pub org_id: String,
    pub token: String,
    pub label: String,
    pub created_by_name: String,
    pub use_count: i64,
    pub created_at: String,
}
#[derive(Clone, Debug, Serialize, Deserialize, PartialEq)]
pub struct User {
    pub id: String,
    pub login_id: String,
    pub name: String,
    pub role: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub org_id: Option<String>,
}
#[derive(Clone, Debug, Serialize, Deserialize)]
pub struct Project {
    pub id: String,
    pub name: String,
    pub description: String,
    pub cities: Vec<String>,
}
#[derive(Clone, Debug, Serialize, Deserialize, PartialEq)]
pub struct Choice {
    pub code: String,
    pub label: String,
}
#[derive(Clone, Debug, Serialize, Deserialize, PartialEq)]
pub struct Condition {
    pub question_id: String,
    pub equals: Value,
}
#[derive(Clone, Debug, Serialize, Deserialize, PartialEq)]
pub struct Question {
    pub id: String,
    pub label: String,
    pub kind: String,
    #[serde(default)]
    pub required: bool,
    #[serde(default)]
    pub choices: Vec<Choice>,
    #[serde(default)]
    pub min: Option<f64>,
    #[serde(default)]
    pub max: Option<f64>,
    #[serde(default)]
    pub show_if: Option<Condition>,
}
#[derive(Clone, Debug, Serialize, Deserialize)]
pub struct Form {
    pub id: String,
    pub project_id: String,
    pub title: String,
    pub description: String,
    pub version: i64,
    pub status: String,
    pub questions: Vec<Question>,
    pub reviewed: bool,
}
#[derive(Clone, Debug, Serialize, Deserialize)]
pub struct Submission {
    pub id: String,
    pub project_id: String,
    pub form_id: String,
    pub form_version: i64,
    pub collector_id: String,
    pub collector_name: String,
    pub collected_at: String,
    pub received_at: String,
    pub timezone: String,
    pub answers: BTreeMap<String, Value>,
    pub statuses: BTreeMap<String, String>,
    pub review_status: String,
}
