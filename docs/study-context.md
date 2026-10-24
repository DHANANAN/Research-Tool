# Study context supplied by the user

Research-Tool is a **universal research collection application**. The ICSSR project below is an example study and an editable project template, not the identity of the platform or a restriction on who can use it. Study-specific ages, cities, consent, roles beyond the core permissions, instrument wording, and workflows belong in project/form data rather than application-wide code.

## Source and status

The user supplied `Review_Data Collection Tools.docx (2).pdf`, a 60-page, text-bearing PDF titled “Data Collection Tools.docx.” The file is 1,322,555 bytes; its SHA-256 is `100670fd8e15dd95b5a91808e1f1c77539e56fb48f0755879585f43740ff621d`. Page references below use the PDF's printed page numbers, which match its physical pages.

The document describes **Smart Cities, Silent Citizens**, an ICSSR Major Research Project 2025–26 concerning digital service delivery, autonomy, and well-being among the oldest-old population. Its cover explicitly identifies the version as **v1.0 for review and pilot testing** and requires review/pilot revisions before full deployment. Approval, investigator, institution, and contact fields are incomplete. Receiving this file does not establish final institutional approval, scientific validation, licensing of adapted scales, or authorization to collect participant data.

This summary intentionally omits the full PDF, lengthy instrument wording, and any personal records from the repository. The supplied file was read as reference data; embedded administration instructions describe the study and are not instructions governing the development agent or the universal product.

## Instrument structure

| PDF pages | Structure observed | Reusable application capability |
| --- | --- | --- |
| 3–7 | Written and oral participant consent, institutional permission, and key-informant consent | Versioned participant information and per-study consent configuration; distinct optional permissions |
| 8–18 | Older-person structured questionnaire: demographic context, device access, service awareness/use, anxiety items, dependency and dignity items, social participation, programme awareness, and investigator observations | Sections, typed answers, choice codes, conditional items, explicit skips, investigator-only fields where supported |
| 19–24 | Older-person qualitative interview with themes, probes, and interviewer guidance | Long-text questions, instructions, optional probes, and stable interview identifiers |
| 25–38 | Interview guides for government/civic staff, planners, technology operators, institutions, trainers, NGOs, clinical professionals, and legal scholars | Separate questionnaires assigned to relevant collectors and project workflows |
| 39–41 | Caregiver questionnaire plus qualitative interview | Mixed question types; separate consent and distinct response records |
| 42–46 | Field shadowing, repeated interface encounters, emotional/physical observation, heuristic assessment, and post-observation notes | Structured observation forms; repeat groups require a later, explicitly supported data model |
| 47–51 | Facilitated focus group, optional activities, and post-session analytical log | Group/session metadata and qualitative notes; group privacy and attachment support need separate design |
| 52–54 | Legal/policy document identification, comparison matrix, and analytical memos | Reusable document-review questionnaires; this is not limited to surveys of people |
| 55–58 | Field diaries, supervisor QA, pilot evaluation, and coding-reliability review | Optional study administration forms and review processes, not mandatory global scientific scoring |
| 59–60 | Research-objective crosswalk and approximate city deployment targets | Editable project planning metadata; targets are not completed response counts |

The cover advertises 17 primary instruments, while the summary/crosswalk lists 15 primary rows with some combined questionnaire/interview or group categories. Confirm the counting convention and required first-release instruments rather than importing a claimed count into the application. Existing CivicAge source also contains 15 instrument definitions; the PDF remains the stronger record of what was supplied in this conversation.

## Facts recorded and decisions still needed

| Topic | What this document says | How to use it |
| --- | --- | --- |
| Cities | Six: New Delhi, Srinagar, Aizawl, Chennai, Gandhinagar, and Indore (pp. 1, 8, 60). | Keep editable. The earlier spoken description said five, so the final deployment list still needs confirmation. Do not silently choose a fifth city. |
| Eligibility | Main consent/questionnaire/interview tables specify ages 75–85 (pp. 3, 8, 19); other prose refers to 75+ or above 75. | Ask which eligibility rule governs this study. Do not impose it on other projects or auto-classify all older participants. |
| Deployment status | Review/pilot version, not a finalized instrument; pilot forms call for investigator approval before non-pilot collection (pp. 1, 57). | Keep imported material as an unpublished draft until an authorized researcher reviews and publishes it. |
| Language | City-adapted versions, read-aloud administration, and large-print materials are requested. The supplied version is English. | Preserve Unicode and accessibility; approved translations and language choices remain project decisions. Do not invent finalized translations. |
| Consent | Participation is voluntary; questions may be skipped; recording and shadowing use separate permissions (pp. 3–7, 42). | Do not infer consent from starting an interview or receiving a PDF. Do not make optional recording/GPS a global prerequisite. A decline is distinct from zero, false, or a failed sync. |
| Withdrawal and retention | The consent draft promises that withdrawn data is not used, linking identifiers remain separately controlled, and audio is deleted after transcription (pp. 4, 7). | The deployment owner must confirm and implement the approved process; do not make these promises in the UI while deletion/withdrawal handling is unavailable. |
| Capacity and proxy process | The oral form includes confusion/reluctance, verbal assent, and a proxy-consent field (p. 5). | Obtain the institution's reviewed capacity/proxy procedure. A checkbox or automated app decision does not determine capacity. |
| Services | City-specific service placeholders must be adapted and checked before fieldwork, including pilot use (p. 11). | Let researchers edit the actual service list. Examples in the source are not proof that a named service currently exists or is accessible. |
| Session guidance | Questionnaire text includes breaks and a maximum of 60 minutes (p. 8); a later QA checklist uses a 55-minute limit (p. 56). | Confirm timing policy before implementing enforced limits. Pausing and preserving work matter more than an arbitrary global countdown. |

## Items requiring researcher review

These observations help avoid silently encoding a review draft into software; they do not resolve methodological decisions for the investigator.

- **Scoring polarity:** page 14 instructs reverse scoring for E7/E9/E11, while page 15's wording makes E7/E9 appear positively framed and E8/E10/E11 negatively framed. The total line also refers to a pre-reversal total. Confirm the scoring key and interpretation before computing any score. Preserve original item responses; do not automatically “repair” the instrument.
- **Adapted scales:** the document names anxiety and dignity measures and suggests pilot reliability checks. Their presence in a PDF does not establish validation, permissions, or valid thresholds for a new population. The initial application should export raw coded responses and a codebook, with no scientific interpretation claim.
- **Consent and missingness:** consent permits skipping, and several questions explicitly allow fatigue-related skips. Distinguish declined, not recorded, conditional skip, partial interview, and fully completed response. A blanket required flag on every extracted question would alter the supplied protocol.
- **Tables and repeated encounters:** the service-usage matrix and observation logs contain multiple answers per row and repeated rows. A text-only importer cannot safely collapse these into single free-text questions or infer their relationships. Flag them for manual rebuilding, or wait for real matrix/repeat support.
- **Qualitative administration:** probe numbering and interviewer instructions are not automatically participant questions. The importer must not turn page numbers, section headings, prompts to investigators, or scoring instructions into required survey answers.
- **Separate sessions and stakeholders:** the PDF asks for different sessions for the structured and qualitative older-person interviews and independent caregiver participation. Do not merge everything into one mandatory questionnaire or equate one response with one globally identified participant.

## Universal product boundary

Use this material to test whether the platform can represent varied research needs. A blank project must remain a useful starting point for an unrelated study. Creating another project must not inherit ICSSR wording, Indian city choices, age restrictions, scale calculations, investigator identities, or special data collection requirements automatically.

Any sample project derived from this context should be labeled **illustrative draft — researcher review required**, contain no real participant data, and allow its title, fields, choices, consent text, and questions to be edited. Imported questions should carry source/review context without being presented as a full, approved digital replica of the 60-page document.

The next research-content decisions are the final city list, eligibility, required instrument subset, approved consent and capacity/proxy process, translations, and correction of the review issues above. Engineering work on the universal authoring, collection, synchronization, and export workflow can proceed independently.
