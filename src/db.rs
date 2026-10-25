use crate::{
    AppState, auth,
    models::{Form, Project, Question},
};
use rusqlite::{Connection, OptionalExtension, params};
use std::{
    path::Path,
    sync::{Arc, Mutex},
};
use uuid::Uuid;

pub fn initialize(
    path: &str,
    admin: Option<(&str, &str, &str)>,
    secure_cookies: bool,
) -> Result<AppState, String> {
    if path != ":memory:"
        && let Some(parent) = Path::new(path).parent()
        && !parent.as_os_str().is_empty()
    {
        std::fs::create_dir_all(parent).map_err(|e| e.to_string())?;
    }
    let db = Connection::open(path).map_err(|e| e.to_string())?;
    db.busy_timeout(std::time::Duration::from_secs(5))
        .map_err(|e| e.to_string())?;
    db.execute_batch("PRAGMA foreign_keys=ON; PRAGMA journal_mode=WAL;
CREATE TABLE IF NOT EXISTS organizations(id TEXT PRIMARY KEY,name TEXT NOT NULL,created_at TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS users(id TEXT PRIMARY KEY,org_id TEXT REFERENCES organizations(id),login_id TEXT UNIQUE NOT NULL,name TEXT NOT NULL,role TEXT NOT NULL CHECK(role IN ('admin','surveyor')),password_hash TEXT,active INTEGER NOT NULL DEFAULT 0,activation_hash TEXT,activation_expires INTEGER);
CREATE TABLE IF NOT EXISTS org_invite_tokens(id TEXT PRIMARY KEY,org_id TEXT NOT NULL REFERENCES organizations(id),token_code TEXT,token_hash TEXT UNIQUE NOT NULL,label TEXT NOT NULL,created_by TEXT NOT NULL REFERENCES users(id),use_count INTEGER NOT NULL DEFAULT 0,created_at TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS org_invite_members(id TEXT PRIMARY KEY,token_id TEXT NOT NULL REFERENCES org_invite_tokens(id),user_id TEXT NOT NULL REFERENCES users(id),joined_at TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS projects(id TEXT PRIMARY KEY,owner_id TEXT NOT NULL REFERENCES users(id),data TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS memberships(project_id TEXT NOT NULL REFERENCES projects(id),user_id TEXT NOT NULL REFERENCES users(id),PRIMARY KEY(project_id,user_id));
CREATE TABLE IF NOT EXISTS forms(id TEXT PRIMARY KEY,project_id TEXT NOT NULL REFERENCES projects(id),lineage_id TEXT NOT NULL,data TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS responses(id TEXT PRIMARY KEY,project_id TEXT NOT NULL REFERENCES projects(id),form_id TEXT NOT NULL REFERENCES forms(id),collector_id TEXT NOT NULL REFERENCES users(id),data TEXT NOT NULL,original_request TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS sessions(token_hash TEXT PRIMARY KEY,user_id TEXT NOT NULL REFERENCES users(id),expires INTEGER NOT NULL);
CREATE TABLE IF NOT EXISTS login_attempts(login_id TEXT PRIMARY KEY,failures INTEGER NOT NULL,window_start INTEGER NOT NULL);
CREATE TABLE IF NOT EXISTS audit_events(id TEXT PRIMARY KEY,actor_id TEXT,project_id TEXT,action TEXT NOT NULL,record_id TEXT,created_at TEXT NOT NULL);
CREATE INDEX IF NOT EXISTS idx_responses_project ON responses(project_id);
CREATE INDEX IF NOT EXISTS idx_forms_project ON forms(project_id);
CREATE INDEX IF NOT EXISTS idx_invite_members_token ON org_invite_members(token_id);").map_err(|e|e.to_string())?;
    // Existing databases must gain columns before indexes can reference them.
    // Inspect metadata and propagate failures: ignoring ALTER errors can leave a
    // partially upgraded database that only fails on the next sign-in.
    let migration = db.unchecked_transaction().map_err(|e| e.to_string())?;
    ensure_column(
        &migration,
        "users",
        "org_id",
        "TEXT REFERENCES organizations(id)",
    )?;
    ensure_column(&migration, "org_invite_tokens", "token_code", "TEXT")?;
    migration
        .execute_batch(
            "CREATE INDEX IF NOT EXISTS idx_users_org ON users(org_id); PRAGMA user_version=2;",
        )
        .map_err(|e| e.to_string())?;
    backfill_organizations(&migration)?;
    migration.commit().map_err(|e| e.to_string())?;
    let count: i64 = db
        .query_row("SELECT count(*) FROM users", [], |r| r.get(0))
        .map_err(|e| e.to_string())?;
    if count == 0
        && let Some((login, password, name)) = admin
    {
        if login.trim().is_empty() || login.len() > 100 || name.trim().is_empty() {
            return Err("Administrator ID and name must be nonempty.".into());
        }
        let hash = auth::hash_password(password)?;
        let uid = Uuid::new_v4().to_string();
        let org_id = Uuid::new_v4().to_string();
        let now = chrono::Utc::now().to_rfc3339();
        let bootstrap = db.unchecked_transaction().map_err(|e| e.to_string())?;
        bootstrap
            .execute(
                "INSERT INTO organizations(id,name,created_at) VALUES(?1,?2,?3)",
                params![org_id, "Default Organization", now],
            )
            .map_err(|e| e.to_string())?;
        bootstrap.execute("INSERT INTO users(id,org_id,login_id,name,role,password_hash,active) VALUES(?1,?2,?3,?4,'admin',?5,1)",params![uid,org_id,login,name,hash]).map_err(|e|e.to_string())?;
        seed(&bootstrap, &uid)?;
        bootstrap.commit().map_err(|e| e.to_string())?;
    }
    Ok(AppState {
        db: Arc::new(Mutex::new(db)),
        secure_cookies,
    })
}
#[derive(serde::Deserialize)]
struct StudyTemplate {
    key: String,
    title: String,
    description: String,
    questions: Vec<Question>,
}

fn seed(db: &Connection, owner: &str) -> Result<(), String> {
    let project = Project {
        id: Uuid::new_v4().to_string(),
        name: "Smart Cities, Silent Citizens".into(),
        description: "Editable SC, SC example workspace. All 15 instrument guides are newly worded, unapproved examples for review; confirm cities, eligibility, consent, and scoring against the approved study protocol.".into(),
        cities: vec!["Delhi".into(), "Aizawl".into(), "Chennai".into(), "Srinagar".into()],
    };
    db.execute(
        "INSERT INTO projects(id,owner_id,data) VALUES(?1,?2,?3)",
        params![
            project.id,
            owner,
            serde_json::to_string(&project).map_err(|e| e.to_string())?
        ],
    )
    .map_err(|e| e.to_string())?;
    db.execute(
        "INSERT INTO memberships(project_id,user_id) VALUES(?1,?2)",
        params![project.id, owner],
    )
    .map_err(|e| e.to_string())?;
    let templates: Vec<StudyTemplate> =
        serde_json::from_str(include_str!("../assets/study-templates.json"))
            .map_err(|e| format!("Invalid bundled study templates: {e}"))?;
    for template in templates {
        crate::validation::schema(&template.questions)
            .map_err(|e| format!("Invalid study template '{}': {e}", template.key))?;
        let form = Form {
            id: Uuid::new_v4().to_string(),
            project_id: project.id.clone(),
            title: template.title,
            description: template.description,
            version: 1,
            status: "draft".into(),
            questions: template.questions,
            reviewed: false,
        };
        db.execute(
            "INSERT INTO forms(id,project_id,lineage_id,data) VALUES(?1,?2,?3,?4)",
            params![
                form.id,
                form.project_id,
                format!("{}:{}", project.id, template.key),
                serde_json::to_string(&form).map_err(|e| e.to_string())?
            ],
        )
        .map_err(|e| e.to_string())?;
    }
    Ok(())
}
pub fn audit(
    db: &Connection,
    actor: &str,
    project: &str,
    action: &str,
    record: &str,
) -> rusqlite::Result<usize> {
    db.execute("INSERT INTO audit_events(id,actor_id,project_id,action,record_id,created_at) VALUES(?1,?2,?3,?4,?5,?6)",params![Uuid::new_v4().to_string(),actor,project,action,record,chrono::Utc::now().to_rfc3339()])
}

/// Self-registration: create a new organization + admin account.
/// Returns `(user_id, org_id)` on success.
pub fn register_org(
    db: &Connection,
    org_name: &str,
    login_id: &str,
    name: &str,
    password_hash: &str,
) -> Result<(String, String), String> {
    let tx = db.unchecked_transaction().map_err(|e| e.to_string())?;
    let db = &tx;
    let existing: i64 = db
        .query_row(
            "SELECT count(*) FROM users WHERE login_id=?1",
            [login_id],
            |r| r.get(0),
        )
        .map_err(|e| e.to_string())?;
    if existing > 0 {
        return Err("That login ID is already taken. Choose a different one.".into());
    }
    let org_id = Uuid::new_v4().to_string();
    let uid = Uuid::new_v4().to_string();
    let now = chrono::Utc::now().to_rfc3339();
    db.execute(
        "INSERT INTO organizations(id,name,created_at) VALUES(?1,?2,?3)",
        params![org_id, org_name, now],
    )
    .map_err(|e| e.to_string())?;
    db.execute(
        "INSERT INTO users(id,org_id,login_id,name,role,password_hash,active) VALUES(?1,?2,?3,?4,'admin',?5,1)",
        params![uid, org_id, login_id, name, password_hash],
    )
    .map_err(|e| e.to_string())?;

    // Create starter study project for the newly registered organization
    let proj_id = Uuid::new_v4().to_string();
    let default_proj = crate::models::Project {
        id: proj_id.clone(),
        name: format!("{} - Primary Study", org_name),
        description: format!("Main research workspace for {}.", org_name),
        cities: vec![],
    };
    db.execute(
        "INSERT INTO projects(id,owner_id,data) VALUES(?1,?2,?3)",
        params![
            proj_id,
            uid,
            serde_json::to_string(&default_proj).map_err(|e| e.to_string())?
        ],
    )
    .map_err(|e| e.to_string())?;
    db.execute(
        "INSERT INTO memberships(project_id,user_id) VALUES(?1,?2)",
        params![proj_id, uid],
    )
    .map_err(|e| e.to_string())?;

    seed(db, &uid)?;
    audit(db, &uid, "", "organization.register", &org_id).map_err(|e| e.to_string())?;
    tx.commit().map_err(|e| e.to_string())?;
    Ok((uid, org_id))
}

/// Create an org-level invite token (admin only).
pub fn create_org_invite(
    db: &Connection,
    org_id: &str,
    created_by: &str,
    label: &str,
    code: &str,
) -> Result<(String, String), String> {
    let normalized = code.trim().to_uppercase();
    let hash = crate::auth::digest(&normalized);
    let existing: i64 = db
        .query_row(
            "SELECT count(*) FROM org_invite_tokens WHERE token_hash=?1",
            [&hash],
            |r| r.get(0),
        )
        .map_err(|e| e.to_string())?;
    if existing > 0 {
        return Err(
            "This invitation code is already in use. Please choose a different code.".into(),
        );
    }
    let id = Uuid::new_v4().to_string();
    let now = chrono::Utc::now().to_rfc3339();
    db.execute(
        "INSERT INTO org_invite_tokens(id,org_id,token_code,token_hash,label,created_by,use_count,created_at) VALUES(?1,?2,?3,?4,?5,?6,0,?7)",
        params![id, org_id, normalized, hash, label, created_by, now],
    )
    .map_err(|e| e.to_string())?;
    Ok((id, normalized))
}

/// Join an org using an invite token — creates a surveyor account in the org.
pub fn join_via_org_invite(
    db: &Connection,
    code_or_token: &str,
    login_id: &str,
    name: &str,
    password_hash: &str,
) -> Result<(crate::models::User, crate::models::Org), String> {
    let tx = db.unchecked_transaction().map_err(|e| e.to_string())?;
    let db = &tx;
    let trimmed = code_or_token.trim();
    let normalized = trimmed.to_uppercase();
    let hash = crate::auth::digest(&normalized);
    let raw_hash = crate::auth::digest(trimmed);

    let row: Option<(String, String, String)> = db
        .query_row(
            "SELECT id,org_id,label FROM org_invite_tokens WHERE token_hash=?1 OR token_hash=?2 OR token_code=?3",
            [&hash, &raw_hash, &normalized],
            |r| Ok((r.get(0)?, r.get(1)?, r.get(2)?)),
        )
        .optional()
        .map_err(|e| e.to_string())?;
    let (token_id, org_id, _label) =
        row.ok_or_else(|| "Invalid or expired invitation code.".to_string())?;
    let existing: i64 = db
        .query_row(
            "SELECT count(*) FROM users WHERE login_id=?1",
            [login_id],
            |r| r.get(0),
        )
        .map_err(|e| e.to_string())?;
    if existing > 0 {
        return Err("That login ID is already taken. Choose a different one.".into());
    }
    let uid = Uuid::new_v4().to_string();
    let now = chrono::Utc::now().to_rfc3339();
    db.execute(
        "INSERT INTO users(id,org_id,login_id,name,role,password_hash,active) VALUES(?1,?2,?3,?4,'surveyor',?5,1)",
        params![uid, org_id, login_id, name, password_hash],
    )
    .map_err(|e| e.to_string())?;

    // Record surveyor in org_invite_members so the admin sees who joined
    let rel_id = Uuid::new_v4().to_string();
    db.execute(
        "INSERT INTO org_invite_members(id,token_id,user_id,joined_at) VALUES(?1,?2,?3,?4)",
        params![rel_id, token_id, uid, now],
    )
    .map_err(|e| e.to_string())?;

    db.execute(
        "UPDATE org_invite_tokens SET use_count=use_count+1 WHERE id=?1",
        [&token_id],
    )
    .map_err(|e| e.to_string())?;

    // Auto-assign new surveyor to all projects belonging to this org
    let mut p_stmt = db
        .prepare("SELECT p.id FROM projects p JOIN users u ON u.id=p.owner_id WHERE u.org_id=?1")
        .map_err(|e| e.to_string())?;
    let pids: Vec<String> = p_stmt
        .query_map([&org_id], |r| r.get(0))
        .map_err(|e| e.to_string())?
        .collect::<Result<_, _>>()
        .map_err(|e| e.to_string())?;
    drop(p_stmt);
    for pid in &pids {
        db.execute(
            "INSERT OR IGNORE INTO memberships(project_id,user_id) VALUES(?1,?2)",
            params![pid, uid],
        )
        .map_err(|e| e.to_string())?;
    }

    let org: crate::models::Org = db
        .query_row(
            "SELECT id,name,created_at FROM organizations WHERE id=?1",
            [&org_id],
            |r| {
                Ok(crate::models::Org {
                    id: r.get(0)?,
                    name: r.get(1)?,
                    created_at: r.get(2)?,
                })
            },
        )
        .map_err(|e| e.to_string())?;
    let user = crate::models::User {
        id: uid,
        org_id: Some(org_id),
        login_id: login_id.to_string(),
        name: name.to_string(),
        role: "surveyor".into(),
    };
    tx.commit().map_err(|e| e.to_string())?;
    Ok((user, org))
}

fn ensure_column(
    db: &Connection,
    table: &str,
    column: &str,
    definition: &str,
) -> Result<(), String> {
    // Names are internal constants, never request data.
    let mut statement = db
        .prepare(&format!("PRAGMA table_info({table})"))
        .map_err(|e| e.to_string())?;
    let columns = statement
        .query_map([], |row| row.get::<_, String>(1))
        .map_err(|e| e.to_string())?
        .collect::<Result<Vec<_>, _>>()
        .map_err(|e| e.to_string())?;
    if !columns.iter().any(|name| name == column) {
        db.execute(
            &format!("ALTER TABLE {table} ADD COLUMN {column} {definition}"),
            [],
        )
        .map_err(|e| e.to_string())?;
    }
    Ok(())
}

fn backfill_organizations(db: &Connection) -> Result<(), String> {
    let mut statement = db
        .prepare("SELECT id,name FROM users WHERE role='admin' AND org_id IS NULL")
        .map_err(|e| e.to_string())?;
    let admins = statement
        .query_map([], |row| {
            Ok((row.get::<_, String>(0)?, row.get::<_, String>(1)?))
        })
        .map_err(|e| e.to_string())?
        .collect::<Result<Vec<_>, _>>()
        .map_err(|e| e.to_string())?;
    for (uid, name) in admins {
        let org_id = Uuid::new_v4().to_string();
        db.execute(
            "INSERT INTO organizations(id,name,created_at) VALUES(?1,?2,?3)",
            params![
                org_id,
                format!("{name}'s organization"),
                chrono::Utc::now().to_rfc3339()
            ],
        )
        .map_err(|e| e.to_string())?;
        db.execute(
            "UPDATE users SET org_id=?1 WHERE id=?2 AND org_id IS NULL",
            params![org_id, uid],
        )
        .map_err(|e| e.to_string())?;
    }
    // Attribute a legacy surveyor only if all existing project owners identify
    // one organization. Preserve memberships even when historical scope differs.
    db.execute("UPDATE users SET org_id=(SELECT min(owner.org_id) FROM memberships m JOIN projects p ON p.id=m.project_id JOIN users owner ON owner.id=p.owner_id WHERE m.user_id=users.id) WHERE role='surveyor' AND org_id IS NULL AND (SELECT count(DISTINCT owner.org_id) FROM memberships m JOIN projects p ON p.id=m.project_id JOIN users owner ON owner.id=p.owner_id WHERE m.user_id=users.id)=1", []).map_err(|e| e.to_string())?;
    Ok(())
}

/// Explicitly opt-in public demonstration accounts. Never run this for ordinary
/// installations. Memberships are limited to a separately owned sandbox study.
pub fn enable_demo_accounts(state: &AppState) -> Result<(), String> {
    let db = state.db.lock().map_err(|_| "Database unavailable")?;
    let tx = db.unchecked_transaction().map_err(|e| e.to_string())?;
    tx.execute_batch("CREATE TABLE IF NOT EXISTS demo_accounts(user_id TEXT PRIMARY KEY REFERENCES users(id),login_id TEXT UNIQUE NOT NULL);").map_err(|e| e.to_string())?;
    let accounts = [
        ("guest-admin", "Guest administrator", "admin"),
        ("guest-surveyor-1", "Guest surveyor one", "surveyor"),
        ("guest-surveyor-2", "Guest surveyor two", "surveyor"),
        ("guest-surveyor-3", "Guest surveyor three", "surveyor"),
    ];
    let mut registered = 0;
    for (login, _, role) in accounts {
        let existing: Option<(String, String)> = tx
            .query_row(
                "SELECT id,role FROM users WHERE login_id=?1",
                [login],
                |r| Ok((r.get(0)?, r.get(1)?)),
            )
            .optional()
            .map_err(|e| e.to_string())?;
        if let Some((id, existing_role)) = existing {
            let managed: bool = tx
                .query_row(
                    "SELECT EXISTS(SELECT 1 FROM demo_accounts WHERE user_id=?1 AND login_id=?2)",
                    params![id, login],
                    |r| r.get(0),
                )
                .map_err(|e| e.to_string())?;
            if !managed || role != existing_role {
                return Err(format!(
                    "Refusing to replace existing non-demo account '{login}'. Use a separate database for demo accounts."
                ));
            }
            registered += 1;
        }
    }
    if registered == 4 {
        return Ok(());
    }
    if registered != 0 {
        return Err("The demonstration account registry is incomplete. Existing accounts were preserved; use a fresh demo database.".into());
    }
    let org_id = Uuid::new_v4().to_string();
    tx.execute(
        "INSERT INTO organizations(id,name,created_at) VALUES(?1,'Research-Tool guest sandbox',?2)",
        params![org_id, chrono::Utc::now().to_rfc3339()],
    )
    .map_err(|e| e.to_string())?;
    let mut user_ids = Vec::new();
    for (login, name, role) in accounts {
        let id = Uuid::new_v4().to_string();
        let hash = auth::hash_password("ResearchDemo2026!")?;
        tx.execute("INSERT INTO users(id,org_id,login_id,name,role,password_hash,active) VALUES(?1,?2,?3,?4,?5,?6,1)",params![id,org_id,login,name,role,hash]).map_err(|e|e.to_string())?;
        tx.execute(
            "INSERT INTO demo_accounts(user_id,login_id) VALUES(?1,?2)",
            params![id, login],
        )
        .map_err(|e| e.to_string())?;
        user_ids.push(id);
    }
    seed(&tx, &user_ids[0])?;
    let project_id: String = tx
        .query_row(
            "SELECT id FROM projects WHERE owner_id=?1 ORDER BY rowid DESC LIMIT 1",
            [&user_ids[0]],
            |r| r.get(0),
        )
        .map_err(|e| e.to_string())?;
    let raw: String = tx
        .query_row(
            "SELECT data FROM forms WHERE project_id=?1 ORDER BY rowid LIMIT 1",
            [&project_id],
            |r| r.get(0),
        )
        .map_err(|e| e.to_string())?;
    let mut example: Form = serde_json::from_str(&raw).map_err(|e| e.to_string())?;
    example.id = Uuid::new_v4().to_string();
    example.title = "SC, SC — fictional practice interview".into();
    example.description = "Guest sandbox only. Use fictional answers to practice collection and export. These are example questions, not an approved ICSSR instrument.".into();
    example.status = "published".into();
    example.reviewed = true;
    tx.execute(
        "INSERT INTO forms(id,project_id,lineage_id,data) VALUES(?1,?2,?1,?3)",
        params![
            example.id,
            project_id,
            serde_json::to_string(&example).map_err(|e| e.to_string())?
        ],
    )
    .map_err(|e| e.to_string())?;
    for uid in &user_ids[1..] {
        tx.execute(
            "INSERT INTO memberships(project_id,user_id) VALUES(?1,?2)",
            params![project_id, uid],
        )
        .map_err(|e| e.to_string())?;
    }
    audit(&tx, &user_ids[0], &project_id, "demo.initialize", &org_id).map_err(|e| e.to_string())?;
    tx.commit().map_err(|e| e.to_string())?;
    Ok(())
}
