# Delivery roadmap

This is a build plan, not a list of implemented features. A milestone is complete only when its acceptance checks run against the application. There are no delivery date or performance commitments yet.

The current development pilot implements the online collection path and a first offline/PDF/export workflow. Checked tasks below record implemented components, while the exit checks still determine readiness for a field release. In particular, production backup/recovery, target-phone verification, protocol approval, and richer permissions remain unfinished. See [development instructions](development.md) for reproducible checks.

## Foundation: this repository

- [x] Record the product vision, user roles, and intended collection workflow.
- [x] Define questionnaire versioning, offline behavior, and Excel output expectations.
- [x] Describe a proposed architecture and phased implementation plan.
- [x] Add an open-source license and contribution guidance.

## Milestone 1: online collection from form to Excel

Deliver the smallest useful vertical slice before expanding the form builder.

- [x] Create a reproducible Rust/API, database initialization, web-client development environment, and CI workflow.
- [x] Add administrator sign-in, secure surveyor activation, project membership, and project assignments.
- [x] Build a manual form editor for text, integer/decimal, yes/no, single-choice, multiple-choice, date, and numeric rating questions; include sections and instructions.
- [x] Support required fields, type/range checks, and simple conditions based on earlier answers.
- [x] Preview a form, publish an immutable version, and collect validated answers online.
- [x] Save submissions with response IDs, surveyor IDs, form version, and timestamps.
- [x] Export an Excel workbook with stable answer columns and a codebook.
- [ ] Add explicit versioned database migrations for future schema upgrades.

**Exit checks:** an administrator creates and publishes a small fictional questionnaire; an assigned surveyor submits it from a phone-sized screen; the exported workbook matches those answers. Unauthorized users cannot read, submit to, or export another project's data. Zero, false, missing, and skipped answers remain distinguishable. Altering a published form requires a new version, and old responses still export correctly. Formula-like text is exported as text.

## Milestone 2: reliable field collection and phone installation

- [x] Add a manifest, icons, HTTPS deployment instructions, and a service worker for an installable PWA.
- [x] Download assigned questionnaire versions after online sign-in.
- [x] Save drafts and queued submissions in IndexedDB; clearly display local, pending, synced, and rejected states.
- [x] Resume an enrolled device's local work according to a documented session policy; do not promise new offline logins.
- [x] Sync on reconnect, app reopen, or explicit user action without depending on background browser execution.
- [x] Reauthorize queued work, deduplicate retried submissions, and preserve rejected payloads for resolution.
- [x] Provide clear shared-device, logout, pending-data, and local-storage guidance.
- [ ] Test keyboard access, labels, touch targets, and a basic screen-reader workflow.

**Exit checks:** collect multiple fictional responses in airplane mode, close and reopen the app, restore connectivity, and verify exactly one server record per response. Interrupt synchronization and retry. Test expired sessions, revoked assignments, old form versions, full local storage, and server validation failures without silently discarding work. Verify browser access and offline resumption on current Android Chrome and iOS Safari; record their installation and storage limits.

## Milestone 3: reviewed PDF import and first-release hardening

- [x] Accept supported text-based PDFs with documented size/page limits and bounded processing.
- [x] Extract question candidates with visible review and incompleteness warnings.
- [ ] Add per-question source-page references and richer table/scale extraction.
- [x] Let the administrator correct wording, types, choices, required flags, and conditions; require review before publishing.
- [x] Reject or clearly identify scanned, unreadable, encrypted, or unsupported PDFs; provide manual entry as a fallback.
- [ ] Add submission management, export permission checks, and auditable administrative changes, including separate response revisions for corrections.
- [ ] Define deployment, backups, restore verification, retention/deletion, and account recovery.
- [ ] Pilot with fictional data, then an institution-approved small study with a documented consent and data-handling process.

**Exit checks:** import representative text PDFs and compare the draft to the originals. Ambiguous or unsupported material never becomes a silently approved question. Verify export totals against server-received submissions and the selected review filters, including mixed form versions; exclude local drafts. Restore a backup in a separate test environment. Run the complete create → publish → assign → collect offline → sync → export workflow before claiming first-release readiness.

**First-release boundary:** milestones 1–3 together meet the initial scope. Completing online collection alone does not complete the offline or PDF requirements.

## Later additions

Prioritize these after field feedback; they are not dependencies of the first release.

- Scanned-PDF OCR with the same review process; optional assisted extraction with explicit provider/data decisions.
- Repeating groups with linked child worksheets, richer branching, calculations, and translations.
- Optional GPS, photographs, attachments, signatures, and consent mechanisms appropriate to each study.
- Public participant links, additional reviewer permissions, institutional single sign-on, and email invitation delivery.
- XLSForm import/export and documented interoperability checks; this is separate from exporting response data to Excel.
- CSV bundles, supported APIs, dashboards, and analysis integrations.

## Decisions to resolve during implementation

These questions do not prevent recording the product idea. Resolve them before they affect a deployment or real participant data.

| Decision | Working assumption | Resolve before |
| --- | --- | --- |
| Hosting and administrator provisioning | Self-hostable instance; explicit setup of the first administrator; no open administrator registration by default. | Authentication and deployment implementation. |
| Identity conventions | Administrator assigns an instance-unique login ID; team-prefixed roll numbers are allowed but not used as authentication secrets. | Account creation and recovery design. |
| Local device/session policy | Offline work requires a previously enrolled device; pending work and shared-device risks must be visible. | Offline collection implementation. |
| Participants and consent | Administrator configures the study's consent and collection requirements; no identifying fields are mandatory by default. | Pilot with participant data. |
| Storage region, retention, and backups | Institution or deployment owner sets policy; no claim that every jurisdiction has the same requirements. | Production deployment. |
| Initial scale and performance | Measure against an agreed study size and target phones; do not infer speed from the language alone. | Capacity planning and load tests. |
| Languages and accessibility | English interface first; preserve Unicode answers and prepare for translations. | Pilot selection and acceptance testing. |

Release checks should exercise behavior, not merely show a running server or a green build. Keep failed, skipped, and unrun checks distinct in release notes.
