# Data and Excel exports

This document defines the full intended response and export contract. The pilot implements real typed `.xlsx` output with a codebook, export metadata, multiple-choice columns, and answer states. Its implementation uses separate sheets per immutable form version rather than merging versions; `declined` state editing, response revisions, and review filters below remain planned. See [the development guide](development.md) for the current boundary. CSV export is an optional later convenience, not a substitute for the structured workbook.

## Questionnaire data rules

Each published questionnaire has an immutable version identifier. Each question has a stable machine ID such as `q_age_years` and a human-readable label. Sections and question wording are editable in drafts; published versions remain available to interpret historical answers.

- Machine IDs use a restricted character set, are unique within a questionnaire, and do not contain participant data. Reserve `__` for system-generated columns.
- Choice questions use stable codes such as `walk` or `bus`, with separate display labels. A translated label must not change the underlying code.
- Retain the same question ID across versions only when meaning and data type remain compatible. A question whose meaning or type changes needs a new ID. Do not reuse an old choice code for a different meaning.
- Store numbers, dates, booleans, text, and choice codes as their own data types. Phone numbers, postal codes, roll numbers, and participant codes are text so leading zeroes survive.
- Never turn an unanswered numeric question into zero or an unanswered yes/no question into `false`.
- Collect only the participant identifiers the study needs. Open-source software does not make questionnaire responses public.

The MVP includes text, integer/decimal, date, yes/no, single choice, multiple choice, section headings, required fields, and simple conditional visibility. Numeric rating scales use bounded integer questions with optional endpoint labels. Repeated groups, files, audio, images, and GPS questions come later.

## Response identity and absence states

One response represents one completed questionnaire submission, not a person globally. A response records:

| Field | Meaning |
| --- | --- |
| `__response_id` | Client-generated UUID, retained across retries |
| `__project_id` | Study/project receiving the response |
| `__form_id` | Questionnaire identity |
| `__form_version` | Published version used during collection |
| `__surveyor_id` | Authorized account that collected the response |
| `__collected_at_utc` | Device-recorded collection timestamp, converted to UTC |
| `__timezone` | Original device timezone or explicit UTC offset |
| `__received_at_utc` | Authoritative server receipt timestamp |
| `__review_status` | Administrator review state: `unreviewed`, `included`, or `excluded`; separate from upload success |
| `__revision` | Exported response revision: 0 for the original, increasing for audited administrator corrections |

Device clocks are not authoritative. Keep collection and receipt times separate. Export timestamps as unambiguous ISO 8601 text; export date-only answers as ISO `YYYY-MM-DD` text with their type recorded in the codebook. This avoids silently shifting a date through timezone conversion.

For every answer, retain one of these statuses:

| Status | Meaning | Exported answer cell |
| --- | --- | --- |
| `answered` | Value was supplied, including zero or false | Typed value |
| `skipped` | The form's conditional rule hid this question | Blank |
| `declined` | Respondent explicitly chose not to answer | Blank |
| `not_recorded` | Applicable optional question was left empty | Blank |
| `not_in_version` | Export combines versions where this question did not yet exist | Blank |

Use a companion column such as `q_age_years__status` so blank cells remain interpretable. An `answered` value must satisfy the published question schema; blank input is not a valid answered number. Mandatory questions prevent submission when applicable, but conditional skips remain valid. A refusal option is available only when the researcher deliberately configures it. Consent/refusal handling must follow the study's configured rules; declining required consent cannot silently become an ordinary completed interview.

## Workbook structure

| Worksheet | MVP content |
| --- | --- |
| `Responses` | One row per server-received submission matching the filters, system metadata, answer columns, and absence-status columns |
| `Codebook` | Form version, question ID, label, type, choice code and label, required/visibility rules, and export column mapping |
| `ExportInfo` | Export creation time, requester, selected forms and versions, filters, snapshot cutoff, row count, timezone convention, and format version |

Exports are administrator-only in the MVP. Select one questionnaire and one or more of its versions explicitly. If multiple versions are included, form a union of compatible question IDs, retain `__form_version` on every row, and use `not_in_version` for questions absent from an older version. Reject incompatible schemas rather than guessing a conversion. Codebook rows remain version-specific even when IDs match.

Export from a consistent database snapshot or a documented stable response set so the recorded count and downloaded data agree. By default include all server-received submissions regardless of review status; an administrator may explicitly filter review states. Local drafts, phone outboxes, and rejected uploads are not in the workbook. Record filters in `ExportInfo`. A download contains study data and must have project authorization, restricted access, and a documented expiration/retention policy.

Use the latest authorized response revision at the snapshot cutoff, without adding duplicate response rows for corrections. Preserve original values and revision history separately with the author, time, and reason; corrections never overwrite the original submission or change its form version. Record this revision-selection policy in `ExportInfo`.

## Question-to-column mapping

| Question type | Answer columns | Interpretation |
| --- | --- | --- |
| Text | `q_comment` | Explicit string cell; preserve Unicode and leading zeroes |
| Integer/decimal | `q_age_years`, `q_measurement` | Numeric cells, subject to documented Excel precision limits |
| Date | `q_visit_date` | ISO date-only text; codebook identifies the date type |
| Yes/no | `q_consents_followup` | Boolean true/false; absence remains blank |
| Single choice | `q_transport` | Stable choice code; labels are in `Codebook` |
| Multiple choice | `q_sources__clinic`, `q_sources__radio`, etc. | One numeric `1`/`0` column per choice |
| Section heading | No answer column | Organizational metadata only |

Each question also has one `question_id__status` column. For an answered multiple-choice question, selected options are `1`, unselected options are `0`; if it is unanswered or skipped, all option cells are blank. Do not represent multiple choices only as a comma-separated text field, which makes reliable analysis harder. Enforce option exclusivity for a configured “none” or “other” choice where appropriate; any “other, specify” text is a separate question with its own ID and status.

Excel limits exact numeric precision to 15 significant digits. Identifiers are always text; values needing more precision require a documented lossless text representation and a codebook note, never silent rounding. Bound cell length, worksheet count, and export size before implementation. If an export exceeds spreadsheet limits, fail with an explanation or split it into explicitly numbered files with counts; never truncate silently.

## Illustrative export fixture

The following invented example contains no real participant data. Form `information_access`, version `1`, has these questions after its study information and consent step:

| Question ID | Wording | Type and rule |
| --- | --- | --- |
| `q_visits` | How many clinic visits did you make in the last seven days? | Optional integer, minimum 0; explicit decline permitted |
| `q_received_info` | Have you received health information in the last month? | Required yes/no |
| `q_sources` | Where did you receive that information? | Multiple choice: `clinic` = Clinic, `radio` = Radio; shown and required only when `q_received_info` is true |

The response sheet below omits most system metadata and some status columns for readability:

| `__response_id` | `q_visits` | `q_visits__status` | `q_received_info` | `q_sources__clinic` | `q_sources__radio` | `q_sources__status` |
| --- | --- | --- | --- | --- | --- | --- |
| `00000000-0000-4000-8000-000000000001` | 0 | answered | true | 1 | 0 | answered |
| `00000000-0000-4000-8000-000000000002` | | declined | false | | | skipped |

Zero visits in the first response is a recorded value, not a missing answer. A person can have received information in the last month without visiting a clinic in the last week. The second response's multiple-choice blanks are explained by the screening answer and `skipped` status. Real workbooks include the boolean answer's status column and version-specific codebook entries as well.

## Future contract for sub-answers and repeated groups

Ordinary sections do not repeat and remain on `Responses` in the MVP. Later, a household-member or repeated-visit group should produce a child worksheet, not overwrite answers or concatenate unrelated records into one cell.

For example, a future `Repeat_household` worksheet contains `__response_id`, `__repeat_id`, `__parent_repeat_id` when needed, `__repeat_index`, and the group's question columns. Every child row links to its parent response; a nested repeated group links to its immediate parent repeat. The codebook describes these relationships. These child sheets are a forward design contract, not an MVP capability.

## Safe spreadsheet generation

Use an XLSX library that supports explicitly typed cells. Participant-controlled text beginning with `=`, `+`, `-`, or `@` must be written as a string, never passed to a formula API. Do not generate formulas, macros, external workbook references, or automatic hyperlinks from answers. Keep the raw stored answer unchanged. Verify the generated workbook's cell types and behavior in supported spreadsheet applications rather than assuming a string-looking value is safe.

If CSV is later supported, document its delimiter, UTF-8 encoding, quoting, and formula-injection escaping separately. CSV cannot carry XLSX cell types; the display-safe CSV representation may require an escape prefix. Record that transformation and preserve raw answers in the database. Numeric negative answers must remain numeric values in XLSX.

## Acceptance checks for implementation

1. Export a known response set and verify its exact response IDs, count, project, form version, and codebook mappings.
2. Verify `0`, `false`, Unicode text, leading-zero identifiers, date-only answers, high-precision values, and explicit missing/skip states survive export without silent conversion.
3. Verify a multiple-choice answer produces the right `1`/`0` cells and an unanswered one produces blank cells with a reason.
4. Combine two compatible versions; ensure old answers retain their original labels/rules in the versioned codebook and absent questions use `not_in_version`.
5. Attempt export and direct file download as an unassigned user and as a surveyor; both must fail authorization.
6. Submit formula-like and hyperlink-like text; inspect XLSX cell types and open the workbook to verify it remains inert text while the database retains the original value.
7. Retry a synchronized response and verify one exported row. Interrupt export generation and verify it cannot publish a partial file as complete.
8. Exercise worksheet/precision/size limits and confirm clear failure or documented splitting, with no data loss.
9. Correct a response through the authorized revision workflow and verify its exported values and revision at the cutoff, while original values remain traceable. A modified submission retry must not act as a correction.
10. When repeat support is implemented, verify every child row has a valid parent, indices preserve order, and export/import checks preserve the relationships.

These are full-product acceptance checks, not a claim that every planned behavior is implemented or tested. The current live-server smoke check verifies the implemented workbook's typed cells, Unicode, leading zeroes, zero/false, multiple-choice indicators, skipped/optional answers, and inert formula-like text. Meaningful analysis depends on the researcher choosing sound questions and interpreting the exported data; this tool must not claim automated scientific conclusions from the workbook.
