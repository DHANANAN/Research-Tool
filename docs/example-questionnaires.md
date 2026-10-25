# Example questionnaire library

The library in [assets/study-templates.json](../assets/study-templates.json) contains 15 editable examples for **Smart Cities, Silent Citizens**. They demonstrate how one universal research application can hold several instruments for a study. Other projects can start with blank questionnaires and their own locations, populations, and consent requirements.

These are **newly worded, unapproved drafts**, informed by the structure of the supplied review document and the earlier CivicAge repository. They are not verbatim copies, approved ICSSR instruments, validated scales, or a complete digital transcription of the supplied PDF. Each description carries that review context. There are 94 question items across the 15 templates.

| Template key | Draft instrument | Example information captured |
| --- | --- | --- |
| `older_adult_structured` | Older resident: service access survey | Optional context, service experience, barriers, and suggested improvements |
| `older_adult_qualitative` | Older resident: experience interview | Lived experience, chosen support, autonomy, and changes requested |
| `caregiver` | Caregiver: support and access interview | Assistance, preferences, support difficulties, and improvements |
| `government_official` | Government official: inclusive service delivery | Responsibilities, consultation, alternative channels, and evidence |
| `urban_planner` | Urban planner: accessibility and public space | Physical access, participation, design, and evaluation |
| `control_centre` | Control-centre staff: support pathways | Contact channels, assistance, escalation, and operational changes |
| `municipal_staff` | Municipal staff: everyday service access | Service steps, points of difficulty, alternatives, and improvements |
| `care_home` | Care-home staff: residents and city services | Requested assistance, resident choice, privacy, and external services |
| `digital_trainer` | Digital trainer: learning and confidence | Learning goals, adapted instruction, practice, and follow-up support |
| `ngo` | Community organization: inclusion and advocacy | Support gaps, resident feedback, coordination, and priorities |
| `clinical_professional` | Clinical professional: access and support needs | General access needs and communication; no patient records |
| `legal_scholar` | Legal scholar: rights and digital access | Rights, alternative access, redress, and relevant public sources |
| `field_observation` | Field observation: service-access encounter | Authorized, non-identifying observations and researcher interpretation |
| `focus_group` | Focus group: facilitated discussion log | Group-process confirmation, shared and differing perspectives, and priorities |
| `policy_review` | Policy document: accessibility review | Document reference, scope, commitments, source locations, and gaps |

## Publication and consent

All 15 library templates must be seeded as `status: "draft"` and `reviewed: false`. Each receives its own questionnaire/version identity. A demo can separately offer a clearly fictional practice questionnaire for collecting test responses; publishing that practice form must not publish these research drafts.

Interview templates start with an unconditional, required boolean `q_consent`. Its value starts unanswered. Questions after it are optional and visible only when consent is true. The focus-group template uses a facilitator confirmation of the separately reviewed group process; it does not replace individual agreement. Observation and policy-document forms are researcher logs and do not include a participant-consent gate. Their descriptions explicitly require any applicable permissions before observing, recording, or interviewing people.

Review and replace the example study information and consent wording before real collection. The final city list and eligibility remain unresolved in the supplied context. The four cities explicitly named by the user are optional example choices; they do not impose platform-wide location rules. The sample age bands are illustrative and need protocol review. No composite scores, reversed items, diagnoses, scientific conclusions, or automatic eligibility decisions are included.

## Data contract

Each object has a stable `key`, editable `title` and `description`, and a `questions` array matching the application's question model. Question and choice codes use letters, digits, and single underscores. Choice labels remain separate from the codes used for conditions and export. All range limits are unset in these examples; numeric questions or protocol-specific validation can be added deliberately in the editor.

Do not change the meaning of a published question in place. Revise a questionnaire into a new draft/version, retain the original response schema, and use its codebook when interpreting exported data. The template file contains no participant records or personal contact information.

The supplied-document observations and unresolved research decisions are recorded in [study context](study-context.md) and [legacy recovery](legacy-recovery.md).
