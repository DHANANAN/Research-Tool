# Recovering the CivicAge work

This report records source observations and design lessons for Research-Tool. It does not establish why a previous deployment failed, whether its deployed settings match this source, or whether a research instrument has been approved or validated. It contains no participant records or credential values.

## Sources inspected

- [DHANANAN/CivicAge-Survey](https://github.com/DHANANAN/CivicAge-Survey/tree/d0d4ed4662341f766e69b5a5efc0cbb54b518f25), commit `d0d4ed4662341f766e69b5a5efc0cbb54b518f25`: Android Kotlin source, the `docs/` and `web/` browser applications, Firestore rules, deployment instructions, and cloud-function source. The two browser instrument-bank files have identical contents at this commit.
- [morluto/rea](https://github.com/morluto/rea/tree/aba487eec0303b3392dbea7f33846617158aad3f), commit `aba487eec0303b3392dbea7f33846617158aad3f`: README and the `reverse-engineer-anything` investigation skill. REA is MIT-licensed; third-party components have their own terms.
- The supplied [shared conversation](https://chatgpt.com/s/cx_6add287e61f88191836efb58ab18f395) returned an HTTP proxy access error in this environment. Its contents were **not read**. An exported or pasted conversation can be incorporated later.
- The user subsequently supplied a 60-page review/pilot PDF, `Review_Data Collection Tools.docx (2).pdf`. See [Study context](study-context.md) for source metadata, page-level findings, and unresolved protocol questions. The user also clarified that Research-Tool must be universal; this study is an editable example project only.

REA's skill explicitly says to use ordinary repository tools for a complete source repository and to skip its readiness/provider commands for that case. That is the route used here: trace source to behavior, state uncertainty, and turn observed risks into checks. No binary decompilation, live cloud access, APK execution, or REA runtime capture was performed. REA is an investigation aid, not an application framework or an automatic reconstruction engine.

No license file was found among the tracked CivicAge files. This implementation should therefore use newly written code and newly worded sample questions, rather than copying its implementation or presenting its instrument wording as newly licensed material. The user can separately clarify the licensing and approval status of their previous work.

## What should survive in the new product

The earlier project already understood several real field-research needs:

- A catalog of instruments for multiple stakeholders, rather than one permanently hardcoded survey.
- A structured older-person questionnaire alongside qualitative interviews and observation notes.
- An intake → consent → interview → review workflow, local drafts, and visible synchronization status.
- Separate field-collector and administrator responsibilities.
- Study context for digital access, civic-service usability, support from other people, barriers, dignity, and open-ended experience.

The browser bank at [`docs/js/instruments.js`](https://github.com/DHANANAN/CivicAge-Survey/blob/d0d4ed4662341f766e69b5a5efc0cbb54b518f25/docs/js/instruments.js) defines 15 instruments. They cover structured and semi-structured older-person interviews; officials, planners, control-center staff, municipal staff, care-home administrators, trainers, NGOs, clinicians, legal scholars, and caregivers; field observation, focus groups, and policy analysis. This is evidence of earlier scope, **not a requirement to ship all 15 before the first useful collection workflow**.

Its older-person instrument uses a 75+ label. The current project must confirm eligibility and the meaning of “oldest old” against the approved protocol instead of inheriting that threshold silently. The named anxiety and dignity question groups are not evidence that the scales have been validated, licensed, scored correctly, or approved for this study.

## Source observations and corresponding checks

All paths below refer to the CivicAge commit above. These are source-level findings; they are not claims about a running deployment.

| Source evidence | Risk or limitation | Requirement for the new application |
| --- | --- | --- |
| `docs/js/app.js`, `login()` and `switchToMasterWithPassword()`; `docs/js/config.js`; Android `config/Config.kt` | Browser-delivered configuration and client-side role changes supply authentication/administrator decisions. A local session or timer cannot enforce server permissions. | Hash passwords on the server, use server-issued sessions, and authorize every protected operation. A collector cannot become an administrator by editing local storage. Do not reuse exposed account credentials or shared tokens. |
| `firestore.rules:11–12` | The wildcard rule unconditionally permits reads and writes. An unused authentication helper does not restrict that rule. | Default-deny server access and test account/project isolation. Do not infer security from deployment documentation alone. |
| `docs/js/api.js:96–113` | Submission becomes synced when a response object exists and `success` is anything except `false`; an ambiguous JSON object may be treated as success. | Require an explicit durable server receipt identifying the submission. Keep the same response ID across retries, verify the receipt, and preserve pending work after network or validation failure. |
| `docs/js/api.js`, `rejectSurvey()` | Local rejection may return success after cloud synchronization fails. | Separate local edits, queued synchronization, server receipt, and research-review status. Each action reports its actual outcome. |
| `docs/js/db.js:68–70` | The save promise resolves on request success rather than transaction completion. | Confirm IndexedDB transaction completion and surface transaction abort/quota errors before claiming a local draft is saved. |
| `docs/js/db.js`, `upsertSurveys()` | Remote merge can substitute zero for missing numeric metadata and default missing consent to true; it also overwrites some local answer data. | Preserve zero versus absence, require explicit consent, and keep queued local work separate from server responses. Never manufacture consent during import or synchronization. |
| `docs/js/app.js`, `renderConsentView()` | Several consent choices start selected. | Present approved study information, start consent unchecked, and distinguish participation from optional recording/location permissions. Refusal must stop interview collection. |
| `docs/js/app.js:1263–1275` | Branching depends on English answer-label fragments for specific question IDs. | Store conditions against stable question/choice codes and validate them against the published form version. Editing or translating labels must not change branching. |
| `docs/js/app.js:1917–1947` | TSV exports put the full answers JSON into one `Answers` cell; several values use truthiness fallbacks. | Generate real XLSX with typed answer columns, multi-choice subcolumns, explicit missing states, version-specific codebooks, and zero/false preservation. |
| `docs/index.html` and `docs/sw.js:47–65` | Offline and cloud-connection labels are declarative; cache-first delivery is not proof that a deployed backend is connected or a form is safely cached. | Show measured server receipt and actual device readiness. Cache only intended static assets; never cache authenticated API responses as a generic fallback. |
| `DEPLOYMENT.md`, manual-backfill instructions; `functions/src/index.ts:140` | The runbook proposes updating an existing record, while the visible trigger uses `onCreate`. That update does not itself invoke this creation trigger. | Make recovery commands match implemented triggers and test them. Prefer one authoritative local server/database path before adding external delivery integrations. |

These observations justify a simpler initial dependency chain: a Rust server, a local SQLite database for the first self-hosted implementation, a browser client, and direct workbook downloads. Google Forms, Apps Script, Drive, Firebase, speech recognition, location, and external AI are not prerequisites for collecting a basic questionnaire. Adding any of them later requires its own authorization, data-handling decision, and verified recovery behavior.

## Study facts and unanswered questions

The user's current scope is a universal application. Their study descriptions and supplied document inform an editable example project, rather than application-wide requirements. Conflicting city/eligibility facts require clarification instead of silently preferring old configuration.

| Topic | Current evidence | Required decision |
| --- | --- | --- |
| Project | ICSSR study described as “Smart Cities, Silent Citizens,” concerning accessibility and usability for older and oldest-old residents. | Confirm the exact title, team ownership, and approved participant-facing wording. |
| Cities | The user named Delhi, Aizawl, Chennai, and Srinagar and said five cities; the later PDF lists six, adding Gandhinagar and Indore. | Confirm the final list. Do not invent a fifth city or silently adopt all six. |
| Legacy city discrepancy | `docs/js/config.js:73–80` lists six cities: New Delhi, Srinagar, Aizawl, Chandigarh, Gandhinagar, and Indore. Its `CH` code means Chandigarh, not Chennai. | Do not import this list as the current protocol or silently reinterpret historical city codes. |
| Instruments | The previous repository contains 15 definitions; the later supplied PDF includes the review/pilot collection suite, not a final approved version. | Confirm the final instrument version and identify which stakeholders/sections the first collection must cover. |
| Consent | The old app and supplied review PDF contain consent text and optional-recording concepts; final approval status remains unconfirmed. | Confirm approved text and procedures for proxy participation, capacity, withdrawal, and optional recording where applicable. |
| Age and eligibility | The old bank labels its oldest-old group as 75+; the later PDF specifies 75–85 in main tables but also uses 75+ prose. | Confirm eligibility, age bands, exclusion rules, and whether age is exact or banded. |
| Languages | The city list implies varied language needs, but no approved translations were provided. | Confirm interface/interview languages and who checks translations. Do not label machine translations as approved. |
| Personal data | The previous app collected identifiers, location, and other metadata. The current task does not require all those fields. | Decide what is necessary, who can access it, retention, hosting region, and backup ownership before real field use. |

These decisions do not block a fictional-data demonstration. They do block presenting a sample as the approved ICSSR instrument or claiming readiness for real participant collection.

## A reusable development brief

Use this brief to keep later implementation grounded in the actual goal:

> Build Research-Tool as a universal, open-source, self-hostable research collection application with a Rust backend and a phone-friendly installable web client. Prioritize the complete administrator → questionnaire draft → reviewed publication → assigned surveyor → consent → field answers → durable server receipt → analysis-ready Excel workflow. Provide a blank project for any research endeavor. Support the “Smart Cities, Silent Citizens” context only through editable project settings and clearly labeled draft templates; never hardcode that study as the platform's purpose. The spoken city count and supplied review PDF disagree, so the final city list remains unconfirmed. Treat prior CivicAge source and the review/pilot PDF as evidence for requirements and failure modes, not proof of deployed behavior, instrument approval, or scale validity. Preserve immutable published versions, stable question and choice codes, original responses, explicit consent, project authorization, recoverable offline work, and duplicate-safe retries. Every claimed capability needs a representative executed check. Keep sample responses fictional and keep secrets and participant data out of code, logs, and prompts. Request missing final questionnaire/consent decisions without blocking independent engineering work. Record decisions and remaining limits, and never silently rewrite an approved research question or infer scientific validity from a tool feature.

“Improve the questions” should mean proposing an editable revision with the rationale and source visible to the researcher. It must not mean changing deployed questionnaires, scoring rules, participant answers, or validated instruments automatically. Any future AI assistance remains optional and requires a separate decision before sending study material to a provider.
