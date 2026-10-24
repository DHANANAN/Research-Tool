use crate::models::Question;
use serde_json::Value;
use std::collections::{BTreeMap, HashSet};

pub fn identifier(value: &str) -> bool {
    !value.is_empty()
        && value.len() <= 64
        && !value.contains("__")
        && value
            .chars()
            .next()
            .is_some_and(|c| c.is_ascii_alphabetic())
        && value.chars().all(|c| c.is_ascii_alphanumeric() || c == '_')
}
pub fn schema(questions: &[Question]) -> Result<(), String> {
    if questions.is_empty() || questions.len() > 200 {
        return Err("A form needs between 1 and 200 questions.".into());
    }
    let mut ids = HashSet::new();
    for q in questions {
        if !identifier(&q.id) || !ids.insert(q.id.clone()) {
            return Err(format!(
                "Question ID '{}' must be unique, start with a letter, and contain only letters, digits and single underscores.",
                q.id
            ));
        }
        if q.label.trim().is_empty() || q.label.len() > 3000 {
            return Err(format!("{} needs a label up to 3000 characters.", q.id));
        }
        if ![
            "text",
            "long_text",
            "integer",
            "decimal",
            "single",
            "multiple",
            "boolean",
            "date",
            "section",
        ]
        .contains(&q.kind.as_str())
        {
            return Err(format!("Unsupported question type: {}", q.kind));
        }
        if q.id == "q_consent" && (q.kind != "boolean" || !q.required || q.show_if.is_some()) {
            return Err(
                "q_consent is reserved for an unconditional required yes/no consent gate.".into(),
            );
        }
        if q.min.is_some_and(|n| !n.is_finite())
            || q.max.is_some_and(|n| !n.is_finite())
            || q.min.zip(q.max).is_some_and(|(a, b)| a > b)
        {
            return Err(format!("Invalid range for {}", q.id));
        }
        if q.kind == "single" || q.kind == "multiple" {
            if q.choices.is_empty() || q.choices.len() > 100 {
                return Err(format!("{} needs between 1 and 100 choices.", q.id));
            }
            let mut choices = HashSet::new();
            for c in &q.choices {
                if !identifier(&c.code)
                    || !choices.insert(c.code.clone())
                    || c.label.trim().is_empty()
                    || c.label.len() > 1000
                {
                    return Err(format!(
                        "{} has invalid or duplicate choice codes/labels.",
                        q.id
                    ));
                }
            }
        } else if !q.choices.is_empty() {
            return Err(format!(
                "{} cannot have choice options for this question type.",
                q.id
            ));
        }
        if let Some(cond) = &q.show_if {
            let ancestor = questions
                .iter()
                .take_while(|p| p.id != q.id)
                .find(|p| p.id == cond.question_id)
                .ok_or_else(|| format!("{} condition must reference an earlier question.", q.id))?;
            if ancestor.kind == "multiple"
                || ancestor.kind == "section"
                || cond.equals.is_null()
                || cond.equals.is_array()
                || cond.equals.is_object()
            {
                return Err(format!(
                    "{} needs a scalar condition based on a supported earlier question.",
                    q.id
                ));
            }
            valid_value(ancestor, &cond.equals)?;
        }
    }
    Ok(())
}
fn valid_value(q: &Question, v: &Value) -> Result<(), String> {
    let invalid = || format!("Invalid answer for '{}'.", q.label);
    match q.kind.as_str() {
        "text" | "long_text" => {
            if !v.is_string() || v.as_str().unwrap_or("").len() > 20000 {
                return Err(invalid());
            }
        }
        "integer" | "decimal" => {
            let n = v.as_f64().filter(|v| v.is_finite()).ok_or_else(invalid)?;
            if q.kind == "integer" && n.fract() != 0.0 {
                return Err(invalid());
            }
            if q.min.is_some_and(|a| n < a) || q.max.is_some_and(|a| n > a) {
                return Err(format!("'{}' is outside the permitted range.", q.label));
            }
        }
        "boolean" => {
            if !v.is_boolean() {
                return Err(invalid());
            }
        }
        "date" => {
            if v.as_str()
                .filter(|s| {
                    s.len() == 10 && chrono::NaiveDate::parse_from_str(s, "%Y-%m-%d").is_ok()
                })
                .is_none()
            {
                return Err(invalid());
            }
        }
        "single" => {
            if !q
                .choices
                .iter()
                .any(|c| v.as_str() == Some(c.code.as_str()))
            {
                return Err(invalid());
            }
        }
        "multiple" => {
            let arr = v.as_array().ok_or_else(invalid)?;
            let mut seen = HashSet::new();
            for item in arr {
                let s = item.as_str().ok_or_else(invalid)?;
                if !seen.insert(s) || !q.choices.iter().any(|c| c.code == s) {
                    return Err(invalid());
                }
            }
        }
        _ => return Err(invalid()),
    }
    Ok(())
}
pub type ValidatedAnswers = (BTreeMap<String, Value>, BTreeMap<String, String>);
pub fn answers(
    questions: &[Question],
    input: &BTreeMap<String, Value>,
) -> Result<ValidatedAnswers, String> {
    for key in input.keys() {
        if !questions
            .iter()
            .any(|q| &q.id == key && q.kind != "section")
        {
            return Err(format!("Unknown answer field: {key}"));
        }
    }
    if questions.iter().any(|q| q.id == "q_consent")
        && input.get("q_consent") != Some(&Value::Bool(true))
    {
        return Err(
            "Consent is required before collecting survey answers. No interview was submitted."
                .into(),
        );
    }
    let mut output = BTreeMap::new();
    let mut statuses = BTreeMap::new();
    for q in questions {
        if q.kind == "section" {
            continue;
        }
        let visible = q
            .show_if
            .as_ref()
            .is_none_or(|c| output.get(&c.question_id) == Some(&c.equals));
        let value = input.get(&q.id);
        let empty = value.is_none_or(|v| {
            v.is_null()
                || v.as_str().is_some_and(|s| s.trim().is_empty())
                || v.as_array().is_some_and(|a| a.is_empty())
        });
        if !visible {
            if !empty {
                return Err(format!(
                    "Hidden question '{}' contains a stale answer. Clear it before submitting.",
                    q.label
                ));
            }
            statuses.insert(q.id.clone(), "skipped".into());
            continue;
        }
        if empty {
            if q.required {
                return Err(format!("'{}' requires an answer.", q.label));
            }
            statuses.insert(q.id.clone(), "not_recorded".into());
            continue;
        }
        let v = value.unwrap();
        valid_value(q, v)?;
        output.insert(q.id.clone(), v.clone());
        statuses.insert(q.id.clone(), "answered".into());
    }
    Ok((output, statuses))
}

#[cfg(test)]
mod tests {
    use super::*;
    use serde_json::json;
    fn question(id: &str, kind: &str, required: bool) -> Question {
        Question {
            id: id.into(),
            label: id.into(),
            kind: kind.into(),
            required,
            choices: vec![],
            min: None,
            max: None,
            show_if: None,
        }
    }
    #[test]
    fn preserves_zero_and_false() {
        let q = vec![
            question("n", "integer", true),
            question("b", "boolean", true),
        ];
        let values = BTreeMap::from([("n".into(), json!(0)), ("b".into(), json!(false))]);
        let (answers, status) = answers(&q, &values).unwrap();
        assert_eq!(answers, values);
        assert_eq!(status["n"], "answered");
    }
    #[test]
    fn rejects_missing_required_and_bad_types() {
        let q = vec![question("n", "integer", true)];
        assert!(answers(&q, &BTreeMap::new()).is_err());
        assert!(answers(&q, &BTreeMap::from([("n".into(), json!("5"))])).is_err());
    }
    #[test]
    fn conditional_stale_answer_is_rejected() {
        let mut second = question("detail", "text", true);
        second.show_if = Some(crate::models::Condition {
            question_id: "gate".into(),
            equals: json!(true),
        });
        let q = vec![question("gate", "boolean", true), second];
        assert!(
            answers(
                &q,
                &BTreeMap::from([
                    ("gate".into(), json!(false)),
                    ("detail".into(), json!("stale"))
                ])
            )
            .is_err()
        );
        let (_, s) = answers(&q, &BTreeMap::from([("gate".into(), json!(false))])).unwrap();
        assert_eq!(s["detail"], "skipped");
    }
    #[test]
    fn condition_must_reference_prior_question() {
        let mut q = question("a", "text", false);
        q.show_if = Some(crate::models::Condition {
            question_id: "later".into(),
            equals: json!("x"),
        });
        assert!(schema(&[q, question("later", "text", false)]).is_err());
    }
    #[test]
    fn consent_cannot_be_forged_or_skipped() {
        let q = vec![question("q_consent", "boolean", true)];
        assert!(answers(&q, &BTreeMap::from([("q_consent".into(), json!(false))])).is_err());
    }
}
