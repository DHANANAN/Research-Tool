//! Conservative, review-only import. Extraction is never publication.
use crate::models::{Choice, Question};
use serde::Serialize;
use std::io::Write;
use std::process::{Command, Stdio};
use std::time::{Duration, Instant};

#[derive(Debug, Serialize)]
pub struct ImportResult {
    pub title: String,
    pub questions: Vec<Question>,
    pub warnings: Vec<String>,
}

fn numbered_question(line: &str) -> Option<&str> {
    let line = line.strip_prefix('Q').unwrap_or(line);
    let end = line.find(|c: char| !c.is_ascii_digit())?;
    if end == 0 || end > 3 {
        return None;
    }
    let tail = &line[end..];
    let tail = tail.strip_prefix('.').or_else(|| tail.strip_prefix(')'))?;
    if !tail.starts_with(char::is_whitespace) {
        return None;
    }
    Some(tail.trim())
}

fn option_text(line: &str) -> Option<&str> {
    for prefix in ["[ ]", "[x]", "[X]", "☐", "□", "•"] {
        if let Some(value) = line.strip_prefix(prefix) {
            return Some(value.trim());
        }
    }
    let line = line.strip_prefix('(').unwrap_or(line);
    let mut chars = line.char_indices();
    let (_, first) = chars.next()?;
    let (index, punctuation) = chars.next()?;
    if first.is_ascii_alphabetic() && matches!(punctuation, '.' | ')') {
        let tail = &line[index + 1..];
        if tail.starts_with(char::is_whitespace) {
            return Some(tail.trim());
        }
    }
    None
}

pub fn parse_text(text: &str) -> ImportResult {
    let mut result = ImportResult {
        title: text.lines().map(str::trim).find(|l| !l.is_empty()).unwrap_or("Imported questionnaire").chars().take(100).collect(),
        questions: Vec::new(),
        warnings: vec![
            "Candidate extraction only. Check every question, choice, instruction, consent statement, and source page before publishing.".into(),
            "Required answers, scoring, validated scales, eligibility, and branching are not inferred. All imported questions start optional.".into(),
        ],
    };
    let mut unmatched = 0;
    for line in text.lines().map(str::trim).filter(|l| !l.is_empty()) {
        let candidate = numbered_question(line).or_else(|| {
            if line.ends_with('?') {
                Some(line)
            } else {
                None
            }
        });
        if let Some(label) = candidate {
            if result.questions.len() >= 200 {
                result.warnings.push("Only the first 200 question candidates are shown. Split the source into instruments and import each separately; this is not a complete import.".into());
                break;
            }
            result.questions.push(Question {
                id: format!("q_import_{}", result.questions.len() + 1),
                label: label.into(),
                kind: "long_text".into(),
                required: false,
                choices: Vec::new(),
                min: None,
                max: None,
                show_if: None,
            });
        } else if let Some(option) = option_text(line) {
            if let Some(question) = result.questions.last_mut() {
                if !option.is_empty() && question.choices.len() < 100 {
                    question.choices.push(Choice {
                        code: format!("option_{}", question.choices.len() + 1),
                        label: option.into(),
                    });
                    let lower = question.label.to_lowercase();
                    question.kind = if lower.contains("select all")
                        || lower.contains("multiple answers")
                        || lower.contains("check all")
                    {
                        "multiple"
                    } else {
                        "single"
                    }
                    .into();
                } else {
                    unmatched += 1;
                }
            } else {
                unmatched += 1;
            }
        } else {
            // Preserve uncertainty instead of silently treating explanatory prose as a question.
            unmatched += 1;
        }
    }
    if unmatched > 0 {
        result.warnings.push(format!("{unmatched} non-question lines were not converted. They may include instructions, continuation text, tables, headings, or answer scales. Compare with the original; add missing material manually."));
    }
    if result.questions.is_empty() {
        result.warnings.push("No clearly numbered or question-mark-terminated questions were detected. Paste a single numbered instrument or enter the questions manually.".into());
    }
    result
}

fn run_bounded(mut command: Command, output: Option<&std::path::Path>) -> Result<(), String> {
    let mut child = command
        .stdout(Stdio::null())
        .stderr(Stdio::null())
        .spawn()
        .map_err(|_| {
            "PDF tools are unavailable. Install poppler-utils or use pasted text/manual entry."
                .to_owned()
        })?;
    let started = Instant::now();
    loop {
        if started.elapsed() > Duration::from_secs(12)
            || output
                .and_then(|p| p.metadata().ok())
                .is_some_and(|m| m.len() > 1_000_000)
        {
            let _ = child.kill();
            let _ = child.wait();
            return Err("Document processing exceeded its time or extracted-text limit. Split the document into smaller instruments.".into());
        }
        match child.try_wait() {
            Ok(Some(status)) if status.success() => return Ok(()),
            Ok(Some(_)) => return Err("This PDF cannot be read. Check that it is not encrypted or damaged; scans require manual entry or OCR outside this pilot.".into()),
            Ok(None) => std::thread::sleep(Duration::from_millis(20)),
            Err(_) => { let _ = child.kill(); let _ = child.wait(); return Err("PDF processing failed. Use pasted text or manual entry.".into()); }
        }
    }
}

pub fn extract_pdf(bytes: &[u8]) -> Result<String, String> {
    if bytes.len() > 8 * 1024 * 1024 {
        return Err("PDFs are limited to 8 MiB. Split larger documents into instruments.".into());
    }
    if !bytes.starts_with(b"%PDF-") {
        return Err("The uploaded file is not a supported PDF.".into());
    }
    let directory =
        tempfile::tempdir().map_err(|_| "Temporary document storage is unavailable.".to_owned())?;
    let input = directory.path().join("source.pdf");
    let output = directory.path().join("extracted.txt");
    std::fs::File::create(&input)
        .and_then(|mut f| f.write_all(bytes))
        .map_err(|_| "Could not stage document for extraction.".to_owned())?;
    let mut command = Command::new("pdftotext");
    // An explicit page range bounds processing. pdfinfo below refuses longer documents
    // instead of allowing this range to silently truncate the research instrument.
    command
        .args(["-layout", "-enc", "UTF-8", "-f", "1", "-l", "100"])
        .arg(&input)
        .arg(&output);
    run_bounded(command, Some(&output))?;
    let page_count = std::fs::read(&output)
        .map_err(|_| "PDF extraction produced no output.".to_owned())?
        .iter()
        .filter(|b| **b == 12)
        .count();
    // pdftotext emits a form-feed per processed page; check the full document's
    // page metadata too. Metadata output is written to a bounded temporary file.
    let info_path = directory.path().join("metadata.txt");
    let info_file = std::fs::File::create(&info_path)
        .map_err(|_| "Temporary PDF metadata storage failed.".to_owned())?;
    let mut info = Command::new("pdfinfo");
    info.arg(&input);
    // run_bounded intentionally suppresses stdout, so use pdfinfo's shell-free
    // subprocess with stdout redirected to a private file here.
    let mut child = info
        .stdout(Stdio::from(info_file))
        .stderr(Stdio::null())
        .spawn()
        .map_err(|_| "pdfinfo is required with pdftotext (poppler-utils).".to_owned())?;
    let started = Instant::now();
    loop {
        if started.elapsed() > Duration::from_secs(5) {
            let _ = child.kill();
            let _ = child.wait();
            return Err("PDF metadata inspection timed out.".into());
        }
        match child.try_wait() {
            Ok(Some(status)) if status.success() => break,
            Ok(Some(_)) => return Err("Could not verify the PDF page count.".into()),
            Ok(None) => std::thread::sleep(Duration::from_millis(20)),
            Err(_) => {
                let _ = child.kill();
                let _ = child.wait();
                return Err("PDF metadata inspection failed.".into());
            }
        }
    }
    let info_text = std::fs::read_to_string(&info_path)
        .map_err(|_| "Could not read PDF metadata.".to_owned())?;
    let pages = info_text
        .lines()
        .find_map(|l| {
            l.strip_prefix("Pages:")
                .and_then(|v| v.trim().parse::<usize>().ok())
        })
        .ok_or("Could not verify the PDF page count.")?;
    if pages > 100 || page_count > 100 {
        return Err(
            "PDFs are limited to 100 pages. Split this document into individual instruments."
                .into(),
        );
    }
    let text = std::fs::read_to_string(output)
        .map_err(|_| "Could not read extracted PDF text.".to_owned())?;
    if text.len() > 1_000_000 {
        return Err("Extracted text exceeds the import limit. Split the document.".into());
    }
    if text.trim().chars().count() < 10 {
        return Err("No readable embedded text was found. This may be a scanned PDF; enter questions manually or supply a text-based PDF.".into());
    }
    Ok(text)
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn import_preserves_candidates_and_makes_no_approval_decisions() {
        let result = parse_text(
            "Travel study\n1. Where do you live?\na) Delhi\nb) Aizawl\n2. Select all barriers\n[ ] Cost\n[ ] No help\nInstructions still need checking",
        );
        assert_eq!(result.questions.len(), 2);
        assert_eq!(result.questions[0].choices[1].label, "Aizawl");
        assert_eq!(result.questions[1].kind, "multiple");
        assert!(
            result
                .questions
                .iter()
                .all(|q| !q.required && q.show_if.is_none())
        );
        assert!(
            result
                .warnings
                .iter()
                .any(|w| w.contains("non-question lines"))
        );
    }
    #[test]
    fn arbitrary_prose_is_not_silently_published_as_questions() {
        let result = parse_text("A review memorandum and explanatory table");
        assert!(result.questions.is_empty());
        assert!(result.warnings.iter().any(|w| w.contains("No clearly")));
        assert!(extract_pdf(b"not a pdf").is_err());
    }
    #[test]
    fn capped_import_is_visibly_incomplete() {
        let text = (1..=210)
            .map(|i| format!("{i}. A question?\n"))
            .collect::<String>();
        let result = parse_text(&text);
        assert_eq!(result.questions.len(), 200);
        assert!(
            result
                .warnings
                .iter()
                .any(|w| w.contains("not a complete import"))
        );
    }
}
