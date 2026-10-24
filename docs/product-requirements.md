# Product requirements

This document describes the full product requirements. The development pilot implements a subset; see [the development guide](development.md) and [working API contract](api-contract.md) for its current behavior and limitations. Requirements in this document are not blanket claims of completed functionality.

## Purpose and boundaries

Research-Tool will help researchers turn questionnaires into usable field forms, collect structured answers, and export those answers for analysis in Excel or another statistics tool. Researchers should spend less time transcribing paper responses and repairing inconsistent spreadsheets.

The application will be an installable progressive web app (PWA) usable in a desktop or phone browser. Installation should be optional. The first release serves researcher-led projects with invited field staff; anonymous public surveys are a later extension.

The software will be open source and its questionnaire definitions editable. Research responses, participant information, and account details remain private to authorized project members. Open-source software does not imply publishing research data.

## People and access

Permissions apply to explicitly assigned projects, which isolate each research team's data. A person can have different permissions in different projects. Formal institution-level administration is a later extension.

| Role | Main responsibilities | Default access |
| --- | --- | --- |
| Researcher / project administrator | Create projects, define consent, design and publish questionnaires, invite staff, manage assignments, review responses, and export data | Manage questionnaires and responses for their own projects; no access to another team's projects |
| Surveyor / student field collector / invigilator | Download assigned questionnaires, conduct interviews, save drafts, submit answers, and track synchronization | Assigned questionnaires and their own responses; no questionnaire editing, staff management, bulk export, or access to other surveyors' responses |
| Supervisor (later addition) | Coordinate collectors and review field submissions when the administrator grants these permissions | Assigned project submissions and review actions; no instance-wide access or automatic export permission |

The MVP has two roles: administrator and surveyor. “Invigilator” is an alternative display label for a surveyor in this release. A separate supervisor role and review interface can follow once teams need broader review permissions. Administrators must not share a single collector account among a team.

### Account creation and sign-in

1. An administrator creates or invites a staff member and assigns a unique login identifier, such as a team prefix plus roll number. Login identifiers must be unique within the hosted instance and are not passwords; different institutions can have overlapping roll numbers.
2. The staff member activates the account using an expiring, single-use invitation or another administrator-mediated activation process, then sets their own password. Email delivery is not required if an invitation can be handed over securely.
3. The application verifies the first sign-in online, establishes the authorized session, and downloads the assigned forms when requested.
4. The administrator can disable an account, revoke project access, and reset activation. Account changes take effect at the server immediately and reach disconnected devices at their next connection.

Passwords must never be visible to an administrator or stored as plaintext. The MVP should use a documented password reset process rather than recover existing passwords. Adding institutional single sign-on is optional later work.

## Core workflows

### 1. Set up a study

The administrator creates a project with a title, description, owner, collection period, participant information, and consent requirements. They choose whether a participant needs a non-identifying participant code. Names, contact details, location, and other identifying information are collected only when the study actually requires them.

The administrator adds staff, assigns questionnaires, and checks the phone preview before field collection. A collector sees only their assignments and the information needed to conduct the interview.

### 2. Build a questionnaire

Administrators can add, reorder, duplicate, and edit sections and questions before publication. Each question has a stable machine-readable code, a human-readable label, a question type, required/optional status, and optional instructions. Choice questions have stable option codes and editable labels.

The MVP supports:

- Short text and long text, including open-ended opinions.
- Integer and decimal numbers with configurable limits.
- Single choice, multiple choice, and yes/no questions.
- Dates and numeric rating scales, represented as bounded integer questions with optional endpoint labels rather than a separate matrix widget.
- Instructions and section headings that are displayed but do not collect answers.
- Required answers, length or range validation, and simple conditional visibility based on earlier answers.

Rules must be understandable in the editor and validated before publication. Hidden questions must not silently contribute stale answers: the form explains that changing a branching answer clears answers in the hidden branch. No scripts supplied by form authors execute in a respondent's browser.

Repeat groups, complex calculations, ranking, matrix questions, audio, photos, signatures, barcode scanning, GPS collection, and multilingual forms are later extensions. The first release must not pretend to support these by silently converting them to text.

### 3. Import a PDF into an editable draft

1. An administrator uploads a questionnaire PDF to their project. The service enforces documented file size and page limits and isolates document processing.
2. The MVP extracts embedded text from readable PDFs and proposes sections, questions, answer choices, and question types. PDF layout alone does not reliably describe skip rules or scoring.
3. The editor shows the source text or page reference alongside the proposed form. Ambiguous fragments and unsupported features are flagged for manual correction.
4. The administrator checks question wording, ordering, option codes, required answers, rules, and participant information. They can add missing questions or remove incorrect detections.
5. Publication requires explicit review and a successful preview. Uploading a PDF never publishes a questionnaire automatically.

Image-only scans require manual entry in the MVP. The UI must explain this limitation and preserve access to the original document. Optical character recognition (OCR), AI-assisted interpretation, Word import, and spreadsheet form imports can be added later. Any future external AI processing must be disclosed and configurable before sending research documents to another provider.

### 4. Publish and assign a version

A questionnaire moves from draft to published to archived. Publishing creates an immutable version, even before any responses exist. A revision creates a new draft and then a new version. Responses retain their original questionnaire version.

Collectors download the version assigned to them. An administrator must choose an explicit retirement policy when replacing it. Queued submissions for a retired version must receive a clear, recoverable outcome instead of being silently remapped to new questions or discarded. Exports retain version information and never merge different questions merely because their labels match.

### 5. Collect in the field

1. A surveyor signs in online, opens an assigned form, and explicitly makes it available offline.
2. The application shows participant information and consent before any interview questions. Where consent is required, a refusal ends the interview without collecting survey answers; retain a minimal refusal record only if the study explicitly requires it.
3. The surveyor enters answers using large touch targets, section navigation, validation messages, and a visible progress indicator. Progress is saved locally as a draft while they work.
4. The surveyor reviews and submits the response. The interface distinguishes saved on this device, queued for upload, received by the server, and upload failed. A locally queued submission must not be labelled received.
5. When connectivity returns, uploads retry safely and show their outcome. Repeated taps, connection loss, and retrying the same submission must not create duplicate response rows.

The first release supports independent interviews on individual devices. Concurrent editing of the same interview from several devices is outside MVP scope. A submitted response becomes read-only for its collector. An administrator can record an audited correction separately from the original submission; returning responses to collectors for editing is a later workflow.

### 6. Review and export

Administrators filter responses by questionnaire version, collection date, collector, and review status. They can inspect validation problems and record corrections or exclusion reasons with an audit history. Original submission values must remain traceable; changing a result must not erase the evidence of what was collected.

The administrator downloads an `.xlsx` workbook containing a response table and a codebook. Each row represents one submitted interview, question codes identify answer columns, and metadata identifies the response, form version, collector, and timestamps. Multi-select answers, missing answers, dates, and numbers need documented, consistent representations. Excel formulas supplied through answer text must not execute when a workbook is opened.

Export all server-received submissions by default, include a review status column, and show active filters before download. Review status is separate from successful upload: use `unreviewed`, `included`, or `excluded`, and allow explicit filters. Unfinished local drafts and rejected uploads are not server submissions and must not appear in a completed-response export. Exporting must never require staff to retype answers or combine one spreadsheet per question manually.

Statistical tests, causal inference, automated scientific conclusions, and bespoke charts are not required for the first release. The primary output is accurate, analysis-ready data with enough context for a researcher to interpret it.

## Phone and offline requirements

- Serve the application over HTTPS and provide a web app manifest and service worker. Support browser use even when the platform does not offer installation.
- Make installation instructions appropriate to the phone's browser; do not assume every browser displays an install button.
- Cache only the application resources and explicitly downloaded assignments needed for authorized field work. Treat cached responses as sensitive research data.
- Support resuming downloaded work on an already authorized device during temporary disconnection. First sign-in, password changes, new assignments, and permission checks require connectivity; the app must not claim that a new user can authenticate offline.
- Define a maximum offline authorization period before release and enforce it locally as far as the platform allows. Explain that remote revocation cannot remove data instantly from a disconnected device.
- Display pending upload counts and require an explicit decision before signing out or clearing local data while responses are unsent. Do not silently delete a day's field work during a cache update.
- Use a dedicated authenticated browser profile or device for field collection; document shared-device limitations. Check storage availability, handle quota errors visibly, and warn before continuing when drafts cannot be saved. Browser storage can be cleared by the user or operating system and is not a guaranteed backup.
- Test accessibility, keyboard navigation, screen-reader labels, small screens, and weak network conditions. Do not rely on color alone for submission status or validation errors.

## Data stewardship

The administrator sets study consent, retention, and access rules before collecting sensitive data. The product must provide project access controls, server-side authorization for every read and write, protected file downloads, secure session handling, and encrypted transport. Backups and restore procedures must be tested before real research collection.

Audit events include account and assignment changes, publication, submission receipt, corrections, exclusions, and exports. Operational logs must avoid questionnaire answers and participant identifiers. Research teams need a documented deletion and retention process that covers server records, uploaded source documents, exports, backups, and devices; downloaded Excel files remain under the recipient's control.

The project must not advertise legal or ethical compliance merely because these controls exist. Each deploying institution remains responsible for its study approvals and applicable obligations.

## MVP acceptance criteria

The first usable release is accepted when all of the following can be demonstrated with a small sample study:

| Area | Required evidence |
| --- | --- |
| Administration | An administrator creates a project and invites two collectors with distinct IDs; an unassigned collector cannot read or submit that project's forms through the UI or API |
| Manual authoring | The administrator creates a sectioned form using the supported question types, validates a conditional rule, previews it on a phone, and publishes it |
| PDF import | A readable PDF becomes an editable draft, uncertain content can be corrected, and publishing is blocked until explicit review; a scan produces an honest unsupported-document message |
| Versioning | A revised questionnaire creates a new version; earlier responses remain readable and export with their original question codes and version |
| Collection | Consent, input validation, local draft recovery, and the final review screen work on a phone-sized viewport |
| Offline operation | A previously authorized device can complete a downloaded form without connectivity; reconnecting uploads it once despite repeated retries and reports a server receipt |
| Recovery | Expired sessions, revoked access, retired forms, and failed uploads leave recoverable local work and a clear next action |
| Excel export | A workbook from representative submissions has the expected rows, stable question codes, typed values, documented missing/multi-select values, a codebook, and safe handling of formula-like answer text |
| Privacy and operations | Project isolation and collector permissions are tested; backup restoration and deliberate local-data clearing are demonstrated before collecting real participant data |

## Later capabilities

After the core workflow is reliable, consider supervisor review queues, public respondent links, OCR, multilingual questionnaires, richer question types, repeat groups, attachments, institution sign-in, and import/export interoperability with established form formats. Prioritize these from actual researcher and collector feedback rather than making them prerequisites for the first usable release.
