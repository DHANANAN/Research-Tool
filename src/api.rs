use crate::{AppState, auth, db, models::*, validation};
use axum::{
    Json, Router,
    body::{Body, Bytes},
    extract::{DefaultBodyLimit, Path, Query, Request, State},
    http::{HeaderMap, StatusCode, header},
    middleware::{self, Next},
    response::{IntoResponse, Response},
    routing::{get, post, put},
};
use rusqlite::{Connection, OptionalExtension, params};
use serde::Deserialize;
use serde_json::{Value, json};
use std::{collections::BTreeMap, sync::MutexGuard};
use tower_http::services::{ServeDir, ServeFile};
use uuid::Uuid;

type ApiResult<T> = Result<T, ApiError>;
static DOCUMENT_JOBS: tokio::sync::Semaphore = tokio::sync::Semaphore::const_new(2);
#[derive(Debug)]
pub struct ApiError(pub StatusCode, pub String);
impl IntoResponse for ApiError {
    fn into_response(self) -> Response {
        (self.0, Json(json!({"error":self.1}))).into_response()
    }
}
impl From<rusqlite::Error> for ApiError {
    fn from(_: rusqlite::Error) -> Self {
        Self(
            StatusCode::INTERNAL_SERVER_ERROR,
            "Database operation failed.".into(),
        )
    }
}
impl From<serde_json::Error> for ApiError {
    fn from(_: serde_json::Error) -> Self {
        Self(
            StatusCode::INTERNAL_SERVER_ERROR,
            "Stored record could not be read.".into(),
        )
    }
}
fn invalid(s: impl Into<String>) -> ApiError {
    ApiError(StatusCode::BAD_REQUEST, s.into())
}
fn missing() -> ApiError {
    ApiError(StatusCode::NOT_FOUND, "Project or record not found.".into())
}
fn conflict(s: impl Into<String>) -> ApiError {
    ApiError(StatusCode::CONFLICT, s.into())
}
fn lock(state: &AppState) -> ApiResult<MutexGuard<'_, Connection>> {
    state.db.lock().map_err(|_| {
        ApiError(
            StatusCode::INTERNAL_SERVER_ERROR,
            "Database unavailable.".into(),
        )
    })
}
fn user(state: &AppState, headers: &HeaderMap) -> ApiResult<User> {
    auth::current_user(state, headers).ok_or(ApiError(
        StatusCode::UNAUTHORIZED,
        "Sign in to continue.".into(),
    ))
}
fn admin(user: &User) -> ApiResult<()> {
    if user.role == "admin" {
        Ok(())
    } else {
        Err(ApiError(
            StatusCode::FORBIDDEN,
            "Administrator access is required.".into(),
        ))
    }
}
fn access(db: &Connection, user: &User, id: &str, admin_only: bool) -> ApiResult<Project> {
    if admin_only {
        admin(user)?;
    }
    let raw:Option<(String,String)>=db.query_row("SELECT owner_id,data FROM projects WHERE id=?1 AND (owner_id=?2 OR EXISTS(SELECT 1 FROM memberships WHERE project_id=?1 AND user_id=?2))",params![id,user.id],|r|Ok((r.get(0)?,r.get(1)?))).optional()?;
    let (owner, data) = raw.ok_or_else(missing)?;
    if admin_only && owner != user.id {
        return Err(missing());
    }
    Ok(serde_json::from_str(&data)?)
}
fn form(db: &Connection, id: &str) -> ApiResult<Form> {
    let raw: Option<String> = db
        .query_row("SELECT data FROM forms WHERE id=?1", [id], |r| r.get(0))
        .optional()?;
    Ok(serde_json::from_str(&raw.ok_or_else(missing)?)?)
}
fn form_rows(db: &Connection, pid: &str) -> ApiResult<Vec<Form>> {
    let mut stmt = db.prepare("SELECT data FROM forms WHERE project_id=?1 ORDER BY rowid")?;
    let raws = stmt
        .query_map([pid], |r| r.get::<_, String>(0))?
        .collect::<Result<Vec<_>, _>>()?;
    raws.into_iter()
        .map(|v| serde_json::from_str(&v).map_err(Into::into))
        .collect()
}
fn response_rows(
    db: &Connection,
    pid: &str,
    collector: Option<&str>,
) -> ApiResult<Vec<Submission>> {
    let mut stmt=db.prepare("SELECT data FROM responses WHERE project_id=?1 AND (?2 IS NULL OR collector_id=?2) ORDER BY rowid DESC")?;
    let raws = stmt
        .query_map(params![pid, collector], |r| r.get::<_, String>(0))?
        .collect::<Result<Vec<_>, _>>()?;
    raws.into_iter()
        .map(|v| serde_json::from_str(&v).map_err(Into::into))
        .collect()
}
fn bounded(value: &str, name: &str, max: usize) -> ApiResult<()> {
    if value.trim().is_empty() || value.len() > max {
        Err(invalid(format!(
            "{name} must be nonempty and at most {max} characters."
        )))
    } else {
        Ok(())
    }
}

pub fn router(state: AppState) -> Router {
    Router::new()
        .route("/api/health", get(|| async { Json(json!({"ok":true})) }))
        .route("/api/auth/login", post(login))
        .route("/api/auth/logout", post(logout))
        .route("/api/auth/activate", post(activate))
        .route("/api/auth/register", post(register))
        .route("/api/auth/join", post(join))
        .route("/api/bootstrap", get(bootstrap))
        .route("/api/projects", post(create_project))
        .route("/api/projects/{id}", put(update_project))
        .route(
            "/api/projects/{id}/members",
            get(members).post(create_member),
        )
        .route("/api/projects/{id}/forms", post(create_form))
        .route("/api/forms/{id}", put(update_form))
        .route("/api/forms/{id}/publish", post(publish))
        .route("/api/forms/{id}/revise", post(revise))
        .route("/api/forms/{id}/close", post(close_form))
        .route("/api/responses", post(submit))
        .route("/api/projects/{id}/responses", get(responses))
        .route("/api/projects/{id}/export.xlsx", get(export))
        .route("/api/projects/{id}/import", post(import_text))
        .route("/api/projects/{id}/import-pdf", post(import_pdf))
        .route(
            "/api/org/invite",
            get(org_invite_list).post(org_invite_create),
        )
        .route(
            "/api/{*path}",
            get(|| async {
                (
                    StatusCode::NOT_FOUND,
                    Json(json!({"error":"Unknown API route."})),
                )
            }),
        )
        .fallback_service(
            ServeDir::new("web/dist").not_found_service(ServeFile::new("web/dist/index.html")),
        )
        .layer(DefaultBodyLimit::max(8 * 1024 * 1024))
        .layer(middleware::from_fn(protect))
        .with_state(state)
}
async fn protect(req: Request, next: Next) -> Response {
    let api = req.uri().path().starts_with("/api/");
    let mut response = if api
        && ![
            axum::http::Method::GET,
            axum::http::Method::HEAD,
            axum::http::Method::OPTIONS,
        ]
        .contains(req.method())
        && req
            .headers()
            .get("x-research-client")
            .and_then(|v| v.to_str().ok())
            != Some("1")
    {
        (
            StatusCode::FORBIDDEN,
            Json(json!({"error":"Missing same-origin client request header."})),
        )
            .into_response()
    } else {
        next.run(req).await
    };
    response.headers_mut().insert(
        "x-content-type-options",
        header::HeaderValue::from_static("nosniff"),
    );
    response.headers_mut().insert(
        "referrer-policy",
        header::HeaderValue::from_static("no-referrer"),
    );
    response.headers_mut().insert("content-security-policy",header::HeaderValue::from_static("default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; connect-src 'self'; object-src 'none'; base-uri 'self'; frame-ancestors 'none'"));
    if api {
        response.headers_mut().insert(
            header::CACHE_CONTROL,
            header::HeaderValue::from_static("no-store"),
        );
    }
    response
}
#[derive(Deserialize)]
struct Login {
    login_id: String,
    password: String,
}
async fn login(State(state): State<AppState>, Json(input): Json<Login>) -> ApiResult<Response> {
    bounded(&input.login_id, "Login ID", 100)?;
    if input.password.len() > 256 {
        return Err(invalid("Password is too long."));
    }
    let now = chrono::Utc::now().timestamp();
    let record: Option<(User, String)> = {
        let db = lock(&state)?;
        let attempts: Option<(i64, i64)> = db
            .query_row(
                "SELECT failures,window_start FROM login_attempts WHERE login_id=?1",
                [&input.login_id],
                |r| Ok((r.get(0)?, r.get(1)?)),
            )
            .optional()?;
        if attempts.is_some_and(|(n, start)| n >= 10 && start > now - 900) {
            return Err(ApiError(
                StatusCode::TOO_MANY_REQUESTS,
                "Too many sign-in attempts. Try again in 15 minutes.".into(),
            ));
        }
        db.query_row(
            "SELECT id,login_id,name,role,org_id,password_hash FROM users WHERE login_id=?1 AND active=1",
            [&input.login_id],
            |r| {
                Ok((
                    User {
                        id: r.get(0)?,
                        login_id: r.get(1)?,
                        name: r.get(2)?,
                        role: r.get(3)?,
                        org_id: r.get(4)?,
                    },
                    r.get(5)?,
                ))
            },
        )
        .optional()?
    };
    let valid = record
        .as_ref()
        .is_some_and(|(_, hash)| auth::verify_password(&input.password, hash));
    if !valid {
        let db = lock(&state)?;
        db.execute("INSERT INTO login_attempts(login_id,failures,window_start) VALUES(?1,1,?2) ON CONFLICT(login_id) DO UPDATE SET failures=CASE WHEN window_start<?3 THEN 1 ELSE failures+1 END,window_start=CASE WHEN window_start<?3 THEN ?2 ELSE window_start END",params![input.login_id,now,now-900])?;
        return Err(ApiError(
            StatusCode::UNAUTHORIZED,
            "Incorrect login ID or password.".into(),
        ));
    }
    let (u, _) = record.unwrap();
    {
        lock(&state)?.execute(
            "DELETE FROM login_attempts WHERE login_id=?1",
            [&u.login_id],
        )?;
    }
    let cookie = auth::session(&state, &u).map_err(invalid)?;
    Ok(([(header::SET_COOKIE, cookie)], Json(json!({"user":u}))).into_response())
}
async fn logout(State(state): State<AppState>, headers: HeaderMap) -> ApiResult<Response> {
    if let Some(raw) = auth::token(&headers) {
        lock(&state)?.execute(
            "DELETE FROM sessions WHERE token_hash=?1",
            [auth::digest(&raw)],
        )?;
    }
    Ok((
        [(
            header::SET_COOKIE,
            "research_session=; HttpOnly; SameSite=Lax; Path=/; Max-Age=0",
        )],
        Json(json!({"ok":true})),
    )
        .into_response())
}
#[derive(Deserialize)]
struct Activate {
    login_id: String,
    activation_code: String,
    password: String,
}
async fn activate(
    State(state): State<AppState>,
    Json(input): Json<Activate>,
) -> ApiResult<Response> {
    bounded(&input.login_id, "Login ID", 100)?;
    if input.activation_code.len() > 256 {
        return Err(invalid("Invalid activation code."));
    }
    let hash = auth::hash_password(&input.password).map_err(invalid)?;
    let u = {
        let db = lock(&state)?;
        let found:Option<User>=db.query_row("SELECT id,login_id,name,role,org_id FROM users WHERE login_id=?1 AND active=0 AND activation_hash=?2 AND activation_expires>?3",params![input.login_id,auth::digest(&input.activation_code),chrono::Utc::now().timestamp()],|r|Ok(User{id:r.get(0)?,login_id:r.get(1)?,name:r.get(2)?,role:r.get(3)?,org_id:r.get(4)?})).optional()?;
        let u = found.ok_or(ApiError(
            StatusCode::UNAUTHORIZED,
            "Invalid or expired activation code.".into(),
        ))?;
        db.execute("UPDATE users SET active=1,password_hash=?1,activation_hash=NULL,activation_expires=NULL WHERE id=?2",params![hash,u.id])?;
        u
    };
    let cookie = auth::session(&state, &u).map_err(invalid)?;
    Ok(([(header::SET_COOKIE, cookie)], Json(json!({"user":u}))).into_response())
}
async fn bootstrap(State(state): State<AppState>, headers: HeaderMap) -> ApiResult<Json<Value>> {
    let u = user(&state, &headers)?;
    let db = lock(&state)?;
    let org: Option<crate::models::Org> = if let Some(ref oid) = u.org_id {
        db.query_row(
            "SELECT id,name,created_at FROM organizations WHERE id=?1",
            [oid],
            |r| {
                Ok(crate::models::Org {
                    id: r.get(0)?,
                    name: r.get(1)?,
                    created_at: r.get(2)?,
                })
            },
        )
        .optional()?
    } else {
        None
    };
    let mut stmt=db.prepare("SELECT data FROM projects WHERE owner_id=?1 OR id IN (SELECT project_id FROM memberships WHERE user_id=?1) ORDER BY rowid")?;
    let raw = stmt
        .query_map([&u.id], |r| r.get::<_, String>(0))?
        .collect::<Result<Vec<_>, _>>()?;
    let projects: Vec<Project> = raw
        .into_iter()
        .map(|s| serde_json::from_str(&s))
        .collect::<Result<_, _>>()?;
    let mut forms = vec![];
    let mut count = 0;
    let mut surveyors = std::collections::HashSet::new();
    for p in &projects {
        for f in form_rows(&db, &p.id)? {
            if u.role == "admin" || f.status != "draft" {
                forms.push(f);
            }
        }
        count += response_rows(
            &db,
            &p.id,
            if u.role == "admin" { None } else { Some(&u.id) },
        )?
        .len();
        if u.role == "admin" {
            let mut q=db.prepare("SELECT u.id FROM users u JOIN memberships m ON m.user_id=u.id WHERE m.project_id=?1 AND u.role='surveyor'")?;
            for id in q.query_map([&p.id], |r| r.get::<_, String>(0))? {
                surveyors.insert(id?);
            }
        }
    }
    Ok(Json(
        json!({"user":u,"org":org,"projects":projects,"forms":forms,"stats":{"responses":count,"surveyors":surveyors.len()}}),
    ))
}
#[derive(Deserialize)]
struct ProjectInput {
    name: String,
    #[serde(default)]
    description: String,
    #[serde(default)]
    cities: Vec<String>,
}
fn project_input(input: &ProjectInput) -> ApiResult<()> {
    bounded(&input.name, "Project title", 200)?;
    if input.description.len() > 20000
        || input.cities.len() > 100
        || input
            .cities
            .iter()
            .any(|s| s.trim().is_empty() || s.len() > 100)
    {
        return Err(invalid(
            "Project description or city list exceeds the supported limits.",
        ));
    }
    Ok(())
}
async fn create_project(
    State(state): State<AppState>,
    headers: HeaderMap,
    Json(input): Json<ProjectInput>,
) -> ApiResult<Json<Project>> {
    let u = user(&state, &headers)?;
    admin(&u)?;
    project_input(&input)?;
    let p = Project {
        id: Uuid::new_v4().to_string(),
        name: input.name,
        description: input.description,
        cities: input.cities,
    };
    let db = lock(&state)?;
    db.execute(
        "INSERT INTO projects(id,owner_id,data) VALUES(?1,?2,?3)",
        params![p.id, u.id, serde_json::to_string(&p)?],
    )?;
    db.execute(
        "INSERT INTO memberships(project_id,user_id) VALUES(?1,?2)",
        params![p.id, u.id],
    )?;
    db::audit(&db, &u.id, &p.id, "project.create", &p.id)?;
    Ok(Json(p))
}
async fn update_project(
    State(state): State<AppState>,
    headers: HeaderMap,
    Path(id): Path<String>,
    Json(input): Json<ProjectInput>,
) -> ApiResult<Json<Project>> {
    let u = user(&state, &headers)?;
    let mut db = lock(&state)?;
    access(&db, &u, &id, true)?;
    project_input(&input)?;
    let p = Project {
        id,
        name: input.name,
        description: input.description,
        cities: input.cities,
    };
    let tx = db.transaction()?;
    tx.execute(
        "UPDATE projects SET data=?1 WHERE id=?2",
        params![serde_json::to_string(&p)?, p.id],
    )?;
    db::audit(&tx, &u.id, &p.id, "project.edit", &p.id)?;
    tx.commit()?;
    Ok(Json(p))
}
async fn members(
    State(state): State<AppState>,
    headers: HeaderMap,
    Path(id): Path<String>,
) -> ApiResult<Json<Vec<User>>> {
    let u = user(&state, &headers)?;
    let db = lock(&state)?;
    access(&db, &u, &id, true)?;
    let mut stmt=db.prepare("SELECT u.id,u.login_id,u.name,u.role,u.org_id FROM users u JOIN memberships m ON m.user_id=u.id WHERE m.project_id=?1 ORDER BY u.name")?;
    let users = stmt
        .query_map([id], |r| {
            Ok(User {
                id: r.get(0)?,
                login_id: r.get(1)?,
                name: r.get(2)?,
                role: r.get(3)?,
                org_id: r.get(4)?,
            })
        })?
        .collect::<Result<Vec<_>, _>>()?;
    Ok(Json(users))
}
#[derive(Deserialize)]
struct MemberInput {
    login_id: String,
    name: String,
}
async fn create_member(
    State(state): State<AppState>,
    headers: HeaderMap,
    Path(id): Path<String>,
    Json(input): Json<MemberInput>,
) -> ApiResult<Json<Value>> {
    let u = user(&state, &headers)?;
    bounded(&input.login_id, "Login ID", 100)?;
    bounded(&input.name, "Name", 200)?;
    let code = auth::random_secret();
    let member = User {
        id: Uuid::new_v4().to_string(),
        login_id: input.login_id,
        name: input.name,
        role: "surveyor".into(),
        org_id: u.org_id.clone(),
    };
    let mut db = lock(&state)?;
    access(&db, &u, &id, true)?;
    let existing: Option<User> = db
        .query_row(
            "SELECT id,login_id,name,role,org_id FROM users WHERE login_id=?1",
            [&member.login_id],
            |r| {
                Ok(User {
                    id: r.get(0)?,
                    login_id: r.get(1)?,
                    name: r.get(2)?,
                    role: r.get(3)?,
                    org_id: r.get(4)?,
                })
            },
        )
        .optional()?;
    if let Some(existing) = existing {
        let owned: bool = db.query_row(
            "SELECT EXISTS(SELECT 1 FROM memberships m JOIN projects p ON p.id=m.project_id WHERE m.user_id=?1 AND p.owner_id=?2)",
            params![existing.id,u.id],
            |r|r.get(0),
        )?;
        if existing.role != "surveyor" || !owned {
            return Err(conflict(
                "This login ID is unavailable. Choose a unique team-prefixed ID.",
            ));
        }
        let tx = db.transaction()?;
        let added = tx.execute(
            "INSERT OR IGNORE INTO memberships(project_id,user_id) VALUES(?1,?2)",
            params![id, existing.id],
        )?;
        if added > 0 {
            db::audit(&tx, &u.id, &id, "member.assign", &existing.id)?;
        }
        tx.commit()?;
        return Ok(Json(
            json!({"user":existing,"activation_code":null,"existing":true}),
        ));
    }
    let tx = db.transaction()?;
    tx.execute("INSERT INTO users(id,org_id,login_id,name,role,activation_hash,activation_expires) VALUES(?1,?2,?3,?4,'surveyor',?5,?6)",params![member.id,member.org_id,member.login_id,member.name,auth::digest(&code),chrono::Utc::now().timestamp()+86400])?;
    tx.execute(
        "INSERT INTO memberships(project_id,user_id) VALUES(?1,?2)",
        params![id, member.id],
    )?;
    db::audit(&tx, &u.id, &id, "member.invite", &member.id)?;
    tx.commit()?;
    Ok(Json(
        json!({"user":member,"activation_code":code,"existing":false}),
    ))
}
#[derive(Deserialize)]
struct FormInput {
    title: String,
    #[serde(default)]
    description: String,
    questions: Vec<Question>,
    #[serde(default)]
    reviewed: bool,
}
fn form_input(input: &FormInput) -> ApiResult<()> {
    bounded(&input.title, "Form title", 200)?;
    if input.description.len() > 20000 || input.questions.len() > 200 {
        return Err(invalid("Form exceeds supported limits."));
    }
    if input.reviewed {
        validation::schema(&input.questions).map_err(invalid)?;
    }
    Ok(())
}
async fn create_form(
    State(state): State<AppState>,
    headers: HeaderMap,
    Path(id): Path<String>,
    Json(input): Json<FormInput>,
) -> ApiResult<Json<Form>> {
    let u = user(&state, &headers)?;
    form_input(&input)?;
    let db = lock(&state)?;
    access(&db, &u, &id, true)?;
    let f = Form {
        id: Uuid::new_v4().to_string(),
        project_id: id,
        title: input.title,
        description: input.description,
        version: 1,
        status: "draft".into(),
        questions: input.questions,
        reviewed: input.reviewed,
    };
    db.execute(
        "INSERT INTO forms(id,project_id,lineage_id,data) VALUES(?1,?2,?1,?3)",
        params![f.id, f.project_id, serde_json::to_string(&f)?],
    )?;
    db::audit(&db, &u.id, &f.project_id, "form.create", &f.id)?;
    Ok(Json(f))
}
async fn update_form(
    State(state): State<AppState>,
    headers: HeaderMap,
    Path(id): Path<String>,
    Json(input): Json<FormInput>,
) -> ApiResult<Json<Form>> {
    let u = user(&state, &headers)?;
    form_input(&input)?;
    let db = lock(&state)?;
    let mut f = form(&db, &id)?;
    access(&db, &u, &f.project_id, true)?;
    if f.status != "draft" {
        return Err(conflict(
            "Published versions cannot be edited. Create a revision.",
        ));
    }
    f.title = input.title;
    f.description = input.description;
    f.questions = input.questions;
    f.reviewed = input.reviewed;
    db.execute(
        "UPDATE forms SET data=?1 WHERE id=?2",
        params![serde_json::to_string(&f)?, id],
    )?;
    db::audit(&db, &u.id, &f.project_id, "form.edit", &id)?;
    Ok(Json(f))
}
async fn publish(
    State(state): State<AppState>,
    headers: HeaderMap,
    Path(id): Path<String>,
) -> ApiResult<Json<Form>> {
    let u = user(&state, &headers)?;
    let db = lock(&state)?;
    let mut f = form(&db, &id)?;
    access(&db, &u, &f.project_id, true)?;
    if f.status != "draft" {
        return Err(conflict("Only drafts can be published."));
    }
    if !f.reviewed {
        return Err(invalid(
            "Review and acknowledge the questionnaire before publishing.",
        ));
    }
    validation::schema(&f.questions).map_err(invalid)?;
    f.status = "published".into();
    db.execute(
        "UPDATE forms SET data=?1 WHERE id=?2",
        params![serde_json::to_string(&f)?, id],
    )?;
    db::audit(&db, &u.id, &f.project_id, "form.publish", &id)?;
    Ok(Json(f))
}
async fn revise(
    State(state): State<AppState>,
    headers: HeaderMap,
    Path(id): Path<String>,
) -> ApiResult<Json<Form>> {
    let u = user(&state, &headers)?;
    let db = lock(&state)?;
    let mut f = form(&db, &id)?;
    access(&db, &u, &f.project_id, true)?;
    if f.status == "draft" {
        return Err(conflict("Edit the existing draft instead."));
    }
    let lineage: String = db.query_row("SELECT lineage_id FROM forms WHERE id=?1", [&id], |r| {
        r.get(0)
    })?;
    let existing: i64 = db.query_row(
        "SELECT count(*) FROM forms WHERE lineage_id=?1 AND json_extract(data,'$.status')='draft'",
        [&lineage],
        |r| r.get(0),
    )?;
    if existing > 0 {
        return Err(conflict("This questionnaire already has a draft revision."));
    }
    let next: i64 = db.query_row(
        "SELECT COALESCE(MAX(json_extract(data,'$.version')),0)+1 FROM forms WHERE lineage_id=?1",
        [&lineage],
        |r| r.get(0),
    )?;
    f.id = Uuid::new_v4().to_string();
    f.version = next;
    f.status = "draft".into();
    f.reviewed = false;
    db.execute(
        "INSERT INTO forms(id,project_id,lineage_id,data) VALUES(?1,?2,?3,?4)",
        params![f.id, f.project_id, lineage, serde_json::to_string(&f)?],
    )?;
    db::audit(&db, &u.id, &f.project_id, "form.revise", &f.id)?;
    Ok(Json(f))
}
async fn close_form(
    State(state): State<AppState>,
    headers: HeaderMap,
    Path(id): Path<String>,
) -> ApiResult<Json<Form>> {
    let u = user(&state, &headers)?;
    let db = lock(&state)?;
    let mut f = form(&db, &id)?;
    access(&db, &u, &f.project_id, true)?;
    if f.status != "published" {
        return Err(conflict("Only a published form can be closed."));
    }
    f.status = "closed".into();
    db.execute(
        "UPDATE forms SET data=?1 WHERE id=?2",
        params![serde_json::to_string(&f)?, id],
    )?;
    db::audit(&db, &u.id, &f.project_id, "form.close", &id)?;
    Ok(Json(f))
}
#[derive(Deserialize, serde::Serialize)]
struct ResponseInput {
    id: String,
    expected_user_id: String,
    form_id: String,
    collected_at: String,
    timezone: String,
    answers: BTreeMap<String, Value>,
}
async fn submit(
    State(state): State<AppState>,
    headers: HeaderMap,
    Json(input): Json<ResponseInput>,
) -> ApiResult<Json<Value>> {
    let u = user(&state, &headers)?;
    if input.expected_user_id != u.id {
        return Err(ApiError(StatusCode::FORBIDDEN, "The signed-in account changed. Sign in to the account that owns this pending work before syncing; local answers must be preserved.".into()));
    }
    if Uuid::parse_str(&input.id).is_err() {
        return Err(invalid("Response ID must be a UUID."));
    }
    let collected_at = chrono::DateTime::parse_from_rfc3339(&input.collected_at)
        .map_err(|_| invalid("Collection time must be an ISO 8601 timestamp."))?
        .with_timezone(&chrono::Utc)
        .to_rfc3339_opts(chrono::SecondsFormat::Millis, true);
    bounded(&input.timezone, "Timezone", 100)?;
    let mut db = lock(&state)?;
    let f = form(&db, &input.form_id)?;
    access(&db, &u, &f.project_id, false)?;
    let original = serde_json::to_string(&input)?;
    let existing: Option<(String, String, String)> = db
        .query_row(
            "SELECT collector_id,original_request,data FROM responses WHERE id=?1",
            [&input.id],
            |r| Ok((r.get(0)?, r.get(1)?, r.get(2)?)),
        )
        .optional()?;
    if let Some((collector, request, data)) = existing {
        if collector != u.id || request != original {
            return Err(conflict(
                "This response ID already contains different content. It cannot be overwritten by a retry.",
            ));
        }
        let sub: Submission = serde_json::from_str(&data)?;
        return Ok(Json(
            json!({"id":sub.id,"received_at":sub.received_at,"collector_id":sub.collector_id,"duplicate":true}),
        ));
    }
    if f.status != "published" {
        return Err(conflict(
            "This form version is not accepting new responses. Local work must be preserved.",
        ));
    }
    let (answers, statuses) = validation::answers(&f.questions, &input.answers).map_err(invalid)?;
    let sub = Submission {
        id: input.id,
        project_id: f.project_id,
        form_id: f.id,
        form_version: f.version,
        collector_id: u.id.clone(),
        collector_name: u.name,
        collected_at,
        received_at: chrono::Utc::now().to_rfc3339_opts(chrono::SecondsFormat::Millis, true),
        timezone: input.timezone,
        answers,
        statuses,
        review_status: "unreviewed".into(),
    };
    let tx = db.transaction()?;
    tx.execute("INSERT INTO responses(id,project_id,form_id,collector_id,data,original_request) VALUES(?1,?2,?3,?4,?5,?6)",params![sub.id,sub.project_id,sub.form_id,sub.collector_id,serde_json::to_string(&sub)?,original])?;
    db::audit(&tx, &u.id, &sub.project_id, "response.receive", &sub.id)?;
    tx.commit()?;
    Ok(Json(
        json!({"id":sub.id,"received_at":sub.received_at,"collector_id":sub.collector_id,"duplicate":false}),
    ))
}
async fn responses(
    State(state): State<AppState>,
    headers: HeaderMap,
    Path(id): Path<String>,
) -> ApiResult<Json<Vec<Submission>>> {
    let u = user(&state, &headers)?;
    let db = lock(&state)?;
    access(&db, &u, &id, false)?;
    Ok(Json(response_rows(
        &db,
        &id,
        if u.role == "admin" { None } else { Some(&u.id) },
    )?))
}
#[derive(Deserialize)]
struct ExportQuery {
    form_id: Option<String>,
}
async fn export(
    State(state): State<AppState>,
    headers: HeaderMap,
    Path(id): Path<String>,
    Query(query): Query<ExportQuery>,
) -> ApiResult<Response> {
    let u = user(&state, &headers)?;
    let (p, forms, responses) = {
        let db = lock(&state)?;
        let p = access(&db, &u, &id, true)?;
        let mut forms = form_rows(&db, &id)?;
        let mut responses = response_rows(&db, &id, None)?;
        if let Some(form_id) = &query.form_id {
            if !forms.iter().any(|f| &f.id == form_id) {
                return Err(missing());
            }
            forms.retain(|f| &f.id == form_id);
            responses.retain(|r| &r.form_id == form_id);
        }
        db::audit(&db, &u.id, &id, "export.request", &id)?;
        (p, forms, responses)
    };
    let permit = DOCUMENT_JOBS.try_acquire().map_err(|_| {
        ApiError(
            StatusCode::TOO_MANY_REQUESTS,
            "Document processing is busy. Please retry shortly.".into(),
        )
    })?;
    let bytes = tokio::task::spawn_blocking(move || {
        let _permit = permit;
        crate::export::build_workbook(&p, &forms, &responses)
    })
    .await
    .map_err(|_| invalid("Export worker failed."))?
    .map_err(invalid)?;
    Ok((
        [
            (
                header::CONTENT_TYPE,
                "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
            ),
            (
                header::CONTENT_DISPOSITION,
                "attachment; filename=research-responses.xlsx",
            ),
        ],
        Body::from(bytes),
    )
        .into_response())
}
#[derive(Deserialize)]
struct ImportText {
    text: String,
}
async fn import_text(
    State(state): State<AppState>,
    headers: HeaderMap,
    Path(id): Path<String>,
    Json(input): Json<ImportText>,
) -> ApiResult<Json<Value>> {
    let u = user(&state, &headers)?;
    {
        let db = lock(&state)?;
        access(&db, &u, &id, true)?;
    }
    if input.text.len() > 200_000 || input.text.trim().is_empty() {
        return Err(invalid(
            "Provide up to 200,000 characters of questionnaire text.",
        ));
    }
    Ok(Json(serde_json::to_value(crate::import::parse_text(
        &input.text,
    ))?))
}
async fn import_pdf(
    State(state): State<AppState>,
    headers: HeaderMap,
    Path(id): Path<String>,
    body: Bytes,
) -> ApiResult<Json<Value>> {
    let u = user(&state, &headers)?;
    {
        let db = lock(&state)?;
        access(&db, &u, &id, true)?;
    }
    if body.len() > 8 * 1024 * 1024 || !body.starts_with(b"%PDF-") {
        return Err(invalid("Provide a PDF no larger than 8 MiB."));
    }
    let permit = DOCUMENT_JOBS.try_acquire().map_err(|_| {
        ApiError(
            StatusCode::TOO_MANY_REQUESTS,
            "Document processing is busy. Please retry shortly.".into(),
        )
    })?;
    let text = tokio::task::spawn_blocking(move || {
        let _permit = permit;
        crate::import::extract_pdf(&body)
    })
    .await
    .map_err(|_| invalid("PDF worker failed."))?
    .map_err(invalid)?;
    Ok(Json(serde_json::to_value(crate::import::parse_text(
        &text,
    ))?))
}

// ── Self-registration ──────────────────────────────────────────────────────
#[derive(Deserialize)]
struct RegisterInput {
    org_name: String,
    login_id: String,
    name: String,
    password: String,
}
async fn register(
    State(state): State<AppState>,
    Json(input): Json<RegisterInput>,
) -> ApiResult<Response> {
    bounded(&input.org_name, "Organisation name", 200)?;
    bounded(&input.login_id, "Login ID", 100)?;
    bounded(&input.name, "Your name", 200)?;
    let hash = auth::hash_password(&input.password).map_err(invalid)?;
    let db = lock(&state)?;
    let (uid, org_id) = db::register_org(&db, &input.org_name, &input.login_id, &input.name, &hash)
        .map_err(invalid)?;
    drop(db);
    let u = User {
        id: uid,
        org_id: Some(org_id),
        login_id: input.login_id,
        name: input.name,
        role: "admin".into(),
    };
    let cookie = auth::session(&state, &u).map_err(invalid)?;
    Ok(([(header::SET_COOKIE, cookie)], Json(json!({ "user": u }))).into_response())
}

// ── Join via org invite token / code ─────────────────────────────────────────
#[derive(Deserialize)]
struct JoinInput {
    #[serde(alias = "code")]
    token: String,
    login_id: String,
    name: String,
    password: String,
}
async fn join(State(state): State<AppState>, Json(input): Json<JoinInput>) -> ApiResult<Response> {
    if input.token.len() > 256 || input.token.trim().is_empty() {
        return Err(invalid("Please provide a valid invitation code."));
    }
    bounded(&input.login_id, "Login ID", 100)?;
    bounded(&input.name, "Your name", 200)?;
    let hash = auth::hash_password(&input.password).map_err(invalid)?;
    let db = lock(&state)?;
    let (u, org) = db::join_via_org_invite(&db, &input.token, &input.login_id, &input.name, &hash)
        .map_err(invalid)?;
    drop(db);
    let cookie = auth::session(&state, &u).map_err(invalid)?;
    Ok((
        [(header::SET_COOKIE, cookie)],
        Json(json!({ "user": u, "org": org })),
    )
        .into_response())
}

// ── Org invite token management ────────────────────────────────────────────
async fn org_invite_list(
    State(state): State<AppState>,
    headers: HeaderMap,
) -> ApiResult<Json<Value>> {
    let u = user(&state, &headers)?;
    admin(&u)?;
    let org_id = u.org_id.as_deref().ok_or_else(|| {
        ApiError(
            StatusCode::BAD_REQUEST,
            "Your account is not associated with an organisation.".into(),
        )
    })?;
    let db = lock(&state)?;
    let mut stmt = db.prepare(
        "SELECT t.id, t.token_code, t.label, t.use_count, t.created_at, u.name \
         FROM org_invite_tokens t JOIN users u ON u.id=t.created_by \
         WHERE t.org_id=?1 ORDER BY t.rowid DESC",
    )?;
    let tokens = stmt
        .query_map([org_id], |r| {
            let token_id: String = r.get(0)?;
            let token_code: Option<String> = r.get(1)?;
            let label: String = r.get(2)?;
            let use_count: i64 = r.get(3)?;
            let created_at: String = r.get(4)?;
            let created_by: String = r.get(5)?;
            Ok((
                token_id, token_code, label, use_count, created_at, created_by,
            ))
        })?
        .collect::<Result<Vec<_>, _>>()?;

    let mut result = Vec::new();
    for (tid, tcode, label, use_count, created_at, created_by) in tokens {
        let mut m_stmt = db.prepare(
            "SELECT u.id, u.name, u.login_id, m.joined_at \
             FROM org_invite_members m JOIN users u ON u.id=m.user_id \
             WHERE m.token_id=?1 ORDER BY m.rowid DESC",
        )?;
        let members: Vec<Value> = m_stmt
            .query_map([&tid], |r| {
                Ok(json!({
                    "id": r.get::<_, String>(0)?,
                    "name": r.get::<_, String>(1)?,
                    "login_id": r.get::<_, String>(2)?,
                    "joined_at": r.get::<_, String>(3)?,
                }))
            })?
            .collect::<Result<Vec<_>, _>>()?;

        let display_code = tcode.unwrap_or_else(|| "N/A".into());
        result.push(json!({
            "id": tid,
            "code": display_code,
            "token": display_code,
            "label": label,
            "use_count": use_count,
            "created_at": created_at,
            "created_by": created_by,
            "members": members,
        }));
    }
    Ok(Json(json!({ "tokens": result })))
}

#[derive(Deserialize)]
struct OrgInviteInput {
    label: String,
    #[serde(default)]
    code: Option<String>,
}
async fn org_invite_create(
    State(state): State<AppState>,
    headers: HeaderMap,
    Json(input): Json<OrgInviteInput>,
) -> ApiResult<Json<Value>> {
    let u = user(&state, &headers)?;
    admin(&u)?;
    bounded(&input.label, "Invite label", 200)?;
    let org_id = u.org_id.as_deref().ok_or_else(|| {
        ApiError(
            StatusCode::BAD_REQUEST,
            "Your account is not associated with an organisation.".into(),
        )
    })?;

    let code_to_use = match input.code {
        Some(ref c) if !c.trim().is_empty() => {
            bounded(c, "Invite code", 50)?;
            c.trim().to_uppercase()
        }
        _ => {
            let secret = auth::random_secret();
            format!("INV-{}", &secret[0..16].to_uppercase())
        }
    };

    let db = lock(&state)?;
    let (id, final_code) =
        db::create_org_invite(&db, org_id, &u.id, &input.label, &code_to_use).map_err(invalid)?;
    Ok(Json(
        json!({ "id": id, "code": final_code, "token": final_code, "label": input.label }),
    ))
}
