//! Typed Excel output. User text is always a string, never a formula or URL.
use crate::models::{Form, Project, Question, Submission};
use rust_xlsxwriter::{Format, Workbook, Worksheet, XlsxError};
use serde_json::Value;

fn string(sheet: &mut Worksheet, row: u32, col: u16, value: &str) -> Result<(), XlsxError> {
    sheet.write_string(row, col, value)?;
    Ok(())
}

fn answer_cell(sheet: &mut Worksheet, row: u32, col: u16, value: &Value) -> Result<(), XlsxError> {
    match value {
        Value::Null => {}
        Value::Bool(v) => {
            sheet.write_boolean(row, col, *v)?;
        }
        Value::Number(v) => {
            let text = v.to_string();
            let significant = text.chars().filter(char::is_ascii_digit).count();
            if significant <= 15 {
                if let Some(number) = v.as_f64() {
                    sheet.write_number(row, col, number)?;
                }
            } else {
                string(sheet, row, col, &text)?;
            }
        }
        Value::String(v) => {
            string(sheet, row, col, v)?;
        }
        // Never flatten unrecognized nested structures into an ambiguous answer.
        _ => {
            return Err(XlsxError::ParameterError(
                "Unsupported nested answer; export requires a defined column mapping.".into(),
            ));
        }
    }
    Ok(())
}

fn columns(question: &Question) -> Vec<String> {
    let mut columns = if question.kind == "multiple" {
        question
            .choices
            .iter()
            .map(|c| format!("{}__{}", question.id, c.code))
            .collect()
    } else {
        vec![question.id.clone()]
    };
    columns.push(format!("{}__status", question.id));
    columns
}

pub fn build_workbook(
    project: &Project,
    forms: &[Form],
    responses: &[Submission],
) -> Result<Vec<u8>, String> {
    build(project, forms, responses)
        .map_err(|e| format!("Workbook generation failed without publishing a partial file: {e}"))
}

fn build(
    project: &Project,
    forms: &[Form],
    responses: &[Submission],
) -> Result<Vec<u8>, XlsxError> {
    let mut workbook = Workbook::new();
    let header = Format::new()
        .set_bold()
        .set_background_color("174B3B")
        .set_font_color("FFFFFF");
    // Each immutable version has its own sheet. Identical-looking question codes
    // from unrelated forms can never be silently combined.
    let selected: Vec<&Form> = forms
        .iter()
        .filter(|f| f.status != "draft" || responses.iter().any(|r| r.form_id == f.id))
        .collect();
    let mut mappings = Vec::new();
    let metadata = [
        "__response_id",
        "__project_id",
        "__form_id",
        "__form_version",
        "__collector_id",
        "__collector_name",
        "__collected_at_utc",
        "__received_at_utc",
        "__timezone",
        "__review_status",
    ];
    for (index, form) in selected.iter().enumerate() {
        let name = if selected.len() == 1 {
            "Responses".to_owned()
        } else {
            format!("Responses_{}", index + 1)
        };
        let sheet = workbook.add_worksheet();
        sheet.set_name(&name)?;
        sheet.set_freeze_panes(1, 1)?;
        sheet.set_column_width(0, 38)?;
        sheet.set_column_range_width(1, 9, 24)?;
        let questions: Vec<&Question> = form
            .questions
            .iter()
            .filter(|q| q.kind != "section")
            .collect();
        let mut headers: Vec<String> = metadata.iter().map(|v| (*v).into()).collect();
        for question in &questions {
            headers.extend(columns(question));
        }
        if headers.len() > 16384 {
            return Err(XlsxError::ParameterError(
                "The form exceeds Excel's column limit; split the instrument.".into(),
            ));
        }
        for (col, name) in headers.iter().enumerate() {
            sheet.write_string_with_format(0, col as u16, name, &header)?;
        }
        let rows: Vec<&Submission> = responses.iter().filter(|r| r.form_id == form.id).collect();
        if rows.len() > 1_048_575 {
            return Err(XlsxError::ParameterError(
                "The response set exceeds Excel's worksheet limit; use smaller exports.".into(),
            ));
        }
        for (row_index, response) in rows.iter().enumerate() {
            let row = row_index as u32 + 1;
            let values = [
                &response.id,
                &response.project_id,
                &response.form_id,
                &response.form_version.to_string(),
                &response.collector_id,
                &response.collector_name,
                &response.collected_at,
                &response.received_at,
                &response.timezone,
                &response.review_status,
            ];
            for (col, value) in values.iter().enumerate() {
                string(sheet, row, col as u16, value)?;
            }
            let mut column = metadata.len() as u16;
            for question in &questions {
                let status = response
                    .statuses
                    .get(&question.id)
                    .map(String::as_str)
                    .unwrap_or("not_recorded");
                let answer = response.answers.get(&question.id).unwrap_or(&Value::Null);
                if question.kind == "multiple" {
                    for choice in &question.choices {
                        if status == "answered" {
                            let chosen = answer.as_array().is_some_and(|values| {
                                values.iter().any(|v| v.as_str() == Some(&choice.code))
                            });
                            sheet.write_number(row, column, if chosen { 1.0 } else { 0.0 })?;
                        }
                        column += 1;
                    }
                } else {
                    if status == "answered" {
                        answer_cell(sheet, row, column, answer)?;
                    }
                    column += 1;
                }
                string(sheet, row, column, status)?;
                column += 1;
            }
        }
        sheet.autofilter(0, 0, rows.len() as u32, (headers.len() - 1) as u16)?;
        mappings.push((name, form.id.clone(), form.version, rows.len()));
    }
    if selected.is_empty() {
        let sheet = workbook.add_worksheet();
        sheet.set_name("Responses")?;
        for (col, name) in metadata.iter().enumerate() {
            sheet.write_string_with_format(0, col as u16, *name, &header)?;
        }
    }
    let codebook = workbook.add_worksheet();
    codebook.set_name("Codebook")?;
    codebook.set_freeze_panes(1, 0)?;
    codebook.set_column_range_width(0, 12, 22)?;
    codebook.set_column_width(5, 55)?;
    let fields = [
        "sheet",
        "form_id",
        "form_title",
        "form_version",
        "question_id",
        "question_label",
        "type",
        "required",
        "choice_code",
        "choice_label",
        "export_column",
        "show_if",
        "range",
    ];
    for (col, name) in fields.iter().enumerate() {
        codebook.write_string_with_format(0, col as u16, *name, &header)?;
    }
    let mut row = 1;
    for (form_index, form) in selected.iter().enumerate() {
        for question in form.questions.iter().filter(|q| q.kind != "section") {
            let variants: Vec<(String, String, String)> = if question.choices.is_empty() {
                vec![(String::new(), String::new(), question.id.clone())]
            } else {
                question
                    .choices
                    .iter()
                    .map(|c| {
                        (
                            c.code.clone(),
                            c.label.clone(),
                            if question.kind == "multiple" {
                                format!("{}__{}", question.id, c.code)
                            } else {
                                question.id.clone()
                            },
                        )
                    })
                    .collect()
            };
            for (code, label, column) in variants.into_iter().chain(std::iter::once((
                String::new(),
                "Answer state: answered / skipped / not_recorded".into(),
                format!("{}__status", question.id),
            ))) {
                let values = [
                    mappings[form_index].0.clone(),
                    form.id.clone(),
                    form.title.clone(),
                    form.version.to_string(),
                    question.id.clone(),
                    question.label.clone(),
                    question.kind.clone(),
                    question.required.to_string(),
                    code,
                    label,
                    column,
                    question
                        .show_if
                        .as_ref()
                        .map(|v| serde_json::to_string(v).unwrap_or_default())
                        .unwrap_or_default(),
                    format!("min={:?}, max={:?}", question.min, question.max),
                ];
                for (col, value) in values.iter().enumerate() {
                    string(codebook, row, col as u16, value)?;
                }
                row += 1;
            }
        }
    }
    let info = workbook.add_worksheet();
    info.set_name("ExportInfo")?;
    info.set_column_width(0, 30)?;
    info.set_column_width(1, 110)?;
    info.write_string_with_format(0, 0, "Property", &header)?;
    info.write_string_with_format(0, 1, "Value", &header)?;
    let properties = [
        ("format_version", "research-tool-pilot-1".to_owned()),
        ("project_id", project.id.clone()), ("project_name", project.name.clone()),
        ("created_at_utc", chrono::Utc::now().to_rfc3339()),
        ("response_count", responses.len().to_string()),
        ("selection", "All server-received submissions for selected forms; no review-status filter. Local drafts and queued/rejected uploads are excluded.".to_owned()),
        ("worksheet_mapping", serde_json::to_string(&mappings).unwrap_or_default()),
        ("versions", "Separate sheet per immutable form version. Do not merge unrelated question codes without the codebook.".to_owned()),
        ("missing_values", "Blank values have a companion __status. Zero and false are recorded values. Optional refusal choices retain their explicit code; a separate declined-state UI is later work.".to_owned()),
        ("timestamps", "UTC ISO 8601 text; original device timezone retained. Device collection time is not authoritative.".to_owned()),
        ("number_precision", "Excel has 15-digit numeric precision. Longer numeric representations are exported as text; identifiers and dates are always text.".to_owned()),
        ("security", "Text cells are explicitly strings; no formulas, hyperlinks, or macros generated from answers.".to_owned()),
        ("scope", "Pilot export. Review/exclusion editing, response correction revisions, and merged-version workbooks remain roadmap features.".to_owned()),
    ];
    for (i, (key, value)) in properties.iter().enumerate() {
        string(info, i as u32 + 1, 0, key)?;
        string(info, i as u32 + 1, 1, value)?;
    }
    workbook.save_to_buffer()
}

/// Long-format CSV: JSON scalars/arrays preserve answer types and identifier zeros.
/// Each row identifies its immutable form, response and question explicitly.
pub fn build_csv(forms: &[Form], responses: &[Submission]) -> String {
    fn field(value: &str, numeric: bool) -> String {
        let dangerous = !numeric
            && (value.trim_start().starts_with(['=', '+', '-', '@'])
                || value.starts_with(['\t', '\r', '\n']));
        format!(
            "\"{}{}\"",
            if dangerous { "'" } else { "" },
            value.replace('"', "\"\"")
        )
    }
    let mut out = String::from(
        "response_id,project_id,form_id,form_version,collector_id,collected_at_utc,received_at_utc,question_id,question_label,question_type,status,answer_json\r\n",
    );
    for response in responses {
        let Some(form) = forms.iter().find(|f| f.id == response.form_id) else {
            continue;
        };
        for q in form.questions.iter().filter(|q| q.kind != "section") {
            let status = response
                .statuses
                .get(&q.id)
                .map(String::as_str)
                .unwrap_or("not_recorded");
            let answer = if status == "answered" {
                response.answers.get(&q.id).unwrap_or(&Value::Null)
            } else {
                &Value::Null
            };
            let values = [
                &response.id,
                &response.project_id,
                &response.form_id,
                &response.form_version.to_string(),
                &response.collector_id,
                &response.collected_at,
                &response.received_at,
                &q.id,
                &q.label,
                &q.kind,
                status,
                &answer.to_string(),
            ];
            out.push_str(
                &values
                    .iter()
                    .enumerate()
                    .map(|(i, v)| field(v, i == 11 && answer.is_number()))
                    .collect::<Vec<_>>()
                    .join(","),
            );
            out.push_str("\r\n");
        }
    }
    out
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn empty_workbook_is_real_zip_not_renamed_csv() {
        let project = Project {
            id: "p".into(),
            name: "Fictional export".into(),
            description: String::new(),
            cities: vec![],
        };
        let bytes = build_workbook(&project, &[], &[]).unwrap();
        assert!(bytes.starts_with(b"PK\x03\x04"));
        assert!(bytes.len() > 1000);
    }
}
