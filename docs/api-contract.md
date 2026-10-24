# Working implementation contract

This document coordinates the first implementation. The running code and tests determine readiness; the broader product blueprint remains a roadmap.

## Runtime

Rust/Axum API, SQLite (bundled library, database at `RESEARCH_DB_PATH`), React/Vite PWA. Serve `web/dist` from the API in production. Local first release deliberately avoids requiring a separately administered database; PostgreSQL remains a later deployment option. Bind `127.0.0.1:3000` by default. Vite proxies `/api` to the Rust server.

Every mutation requires header `X-Research-Client: 1`; use same-origin cookies and no cross-origin API policy. Session cookies: HttpOnly, SameSite=Lax, configurable Secure for HTTPS. JSON errors are `{ "error": "explanation" }`. Route paths below use ordinary URL parameters; they are not literal braces in requests.

## Objects

```typescript
type User = { id: string; login_id: string; name: string; role: 'admin' | 'surveyor' };
type Project = { id: string; name: string; description: string; cities: string[] };
type Choice = { code: string; label: string };
type Question = {
  id: string; label: string;
  kind: 'text' | 'long_text' | 'integer' | 'decimal' | 'single' | 'multiple' | 'boolean' | 'date' | 'section';
  required: boolean; choices: Choice[];
  min?: number | null; max?: number | null;
  show_if?: { question_id: string; equals: string | boolean | number } | null;
};
type Form = {
  id: string; project_id: string; title: string; description: string;
  version: number; status: 'draft' | 'published' | 'closed';
  questions: Question[]; reviewed: boolean;
};
type Submission = {
  id: string; project_id: string; form_id: string; form_version: number;
  collector_id: string; collector_name: string;
  collected_at: string; received_at: string; timezone: string;
  answers: Record<string, unknown>; statuses: Record<string, string>;
  review_status: string;
};
```

Question IDs exclude `__` and must be stable. Preserve form ID for one version: a revision receives a new form ID and incremented version; logical grouping by project and title is provisional until a dedicated questionnaire entity exists. Invitations and session secrets are never included in general bootstrap responses.

## API

| Method and path | Request | Response |
| --- | --- | --- |
| GET `/api/health` | | `{ok:true}` |
| POST `/api/auth/login` | `{login_id,password}` | `{user}` and session cookie |
| POST `/api/auth/logout` | | `{ok:true}` |
| POST `/api/auth/activate` | `{login_id,activation_code,password}` | `{user}` and session cookie |
| GET `/api/bootstrap` | | `{user,projects,forms,stats:{responses,surveyors}}`; admin sees own projects, surveyor assigned ones |
| POST `/api/projects` | `{name,description,cities}` | Project; administrator only |
| PUT `/api/projects/{id}` | `{name,description,cities}` | Updated Project; owner administrator only, preserving members/forms/responses |
| GET `/api/projects/{id}/members` | | `User[]`; administrator only |
| POST `/api/projects/{id}/members` | `{login_id,name}` | `{user,activation_code}`; administrator only, show code once |
| POST `/api/projects/{id}/forms` | `{title,description,questions,reviewed}` | Form, new draft |
| PUT `/api/forms/{id}` | `{title,description,questions,reviewed}` | Form; draft only |
| POST `/api/forms/{id}/publish` | `{}` | Form; explicit reviewed=true and valid schema required |
| POST `/api/forms/{id}/revise` | `{}` | New draft Form copied from immutable version |
| POST `/api/forms/{id}/close` | `{}` | Closed Form |
| POST `/api/responses` | `{id,form_id,expected_user_id,collected_at,timezone,answers}` | `{id,received_at,collector_id,duplicate:boolean}`; atomic, idempotent, schema validated; expected identity must match the session to prevent cross-tab misattribution |
| GET `/api/projects/{id}/responses` | | `Submission[]`; surveyor own records only |
| GET `/api/projects/{id}/export.xlsx` | optional `form_id` query | Real XLSX; administrator only |
| POST `/api/projects/{id}/import` | `{text}` | `{title,questions,warnings}`; candidate draft only |
| POST `/api/projects/{id}/import-pdf` | raw PDF bytes, `Content-Type: application/pdf` | `{title,questions,warnings}`; candidate draft only |

Project membership grants access to published project forms in this first implementation. Per-questionnaire assignments, revocations UI, response corrections, advanced filters, and additional permission roles remain roadmap work. Do not silently claim these broader blueprint features are already implemented.

## Initial study

Seed an administrator-owned project named “Smart Cities, Silent Citizens” with Delhi, Aizawl, Chennai, and Srinagar. The fifth city is unconfirmed and must not be invented. Seed a clearly marked, unapproved example questionnaire as a draft; include consent, optional non-identifying participant code, city, age band, access to services, barriers, and open comments. Never describe these candidate questions or age bands as ICSSR-approved. No real responses or sample participant accounts are seeded.

Bootstrap administrator uses `RESEARCH_ADMIN_ID`, `RESEARCH_ADMIN_PASSWORD`, and optional `RESEARCH_ADMIN_NAME` only on an empty user database. Development script creates a random password in ignored `.local/admin-password` with private file permissions; never commit or display its value in logs.
