use crate::{
    AppState, auth,
    models::{Choice, Condition, Form, Project, Question},
};
use rusqlite::{Connection, params};
use serde_json::json;
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
CREATE INDEX IF NOT EXISTS idx_users_org ON users(org_id);
CREATE INDEX IF NOT EXISTS idx_invite_members_token ON org_invite_members(token_id);").map_err(|e|e.to_string())?;
    let _ = db.execute(
        "ALTER TABLE org_invite_tokens ADD COLUMN token_code TEXT",
        [],
    );
    let _ = db.execute(
        "ALTER TABLE users ADD COLUMN org_id TEXT REFERENCES organizations(id)",
        [],
    );
    let count: i64 = db
        .query_row("SELECT count(*) FROM users", [], |r| r.get(0))
        .map_err(|e| e.to_string())?;
    if count == 0 {
        let (login,password,name)=admin.ok_or("An empty database requires RESEARCH_ADMIN_ID and RESEARCH_ADMIN_PASSWORD (minimum 12 characters). Run scripts/dev.sh for local development.")?;
        if login.trim().is_empty() || login.len() > 100 || name.trim().is_empty() {
            return Err("Administrator ID and name must be nonempty.".into());
        }
        let hash = auth::hash_password(password)?;
        let uid = Uuid::new_v4().to_string();
        let org_id = Uuid::new_v4().to_string();
        let now = chrono::Utc::now().to_rfc3339();
        db.execute(
            "INSERT INTO organizations(id,name,created_at) VALUES(?1,?2,?3)",
            params![org_id, "Default Organization", now],
        )
        .map_err(|e| e.to_string())?;
        db.execute("INSERT INTO users(id,org_id,login_id,name,role,password_hash,active) VALUES(?1,?2,?3,?4,'admin',?5,1)",params![uid,org_id,login,name,hash]).map_err(|e|e.to_string())?;
        seed(&db, &uid)?;
    }
    Ok(AppState {
        db: Arc::new(Mutex::new(db)),
        secure_cookies,
    })
}
fn seed(db: &Connection, owner: &str) -> Result<(), String> {
    let project=Project{id:Uuid::new_v4().to_string(),name:"Smart Cities, Silent Citizens".into(),description:"ICSSR study workspace: accessibility and usability of smart-city initiatives for older people. Fifth city and approved instruments await confirmation. The example below is unapproved and must be reviewed before use.".into(),cities:vec!["Delhi".into(),"Aizawl".into(),"Chennai".into(),"Srinagar".into()]};
    db.execute(
        "INSERT INTO projects(id,owner_id,data) VALUES(?1,?2,?3)",
        params![project.id, owner, serde_json::to_string(&project).unwrap()],
    )
    .map_err(|e| e.to_string())?;
    db.execute(
        "INSERT INTO memberships(project_id,user_id) VALUES(?1,?2)",
        params![project.id, owner],
    )
    .map_err(|e| e.to_string())?;
    let mut questions = vec![
        q(
            "q_consent",
            "Has the participant freely agreed to this interview after hearing the study information?",
            "boolean",
            true,
            vec![],
        ),
        q(
            "q_participant_code",
            "Participant code (optional, avoid names and contact details)",
            "text",
            false,
            vec![],
        ),
        q(
            "q_city",
            "Study city",
            "single",
            false,
            vec![
                ("delhi", "Delhi"),
                ("aizawl", "Aizawl"),
                ("chennai", "Chennai"),
                ("srinagar", "Srinagar"),
            ],
        ),
        q(
            "q_age_band",
            "Participant age band — candidate categories, confirm with the approved study protocol",
            "single",
            false,
            vec![
                ("age_60_69", "60–69"),
                ("age_70_79", "70–79"),
                ("age_80_plus", "80 and above"),
                ("not_disclosed", "Prefer not to say"),
            ],
        ),
        q(
            "q_service_access",
            "How easy is it to use the city service you discussed in this interview?",
            "single",
            false,
            vec![
                ("very_easy", "Very easy"),
                ("easy", "Easy"),
                ("difficult", "Difficult"),
                ("very_difficult", "Very difficult"),
                ("not_used", "Have not used it"),
            ],
        ),
        q(
            "q_barriers",
            "Which barriers, if any, affected access? Select all that apply.",
            "multiple",
            false,
            vec![
                ("digital", "Digital skills or device access"),
                ("physical", "Physical accessibility"),
                ("language", "Language or information"),
                ("cost", "Cost"),
                ("other", "Other"),
            ],
        ),
        q(
            "q_comments",
            "What change would make these city services easier to use?",
            "long_text",
            false,
            vec![],
        ),
    ];
    for question in questions.iter_mut().skip(1) {
        question.show_if = Some(Condition {
            question_id: "q_consent".into(),
            equals: json!(true),
        });
    }
    let form=Form{id:Uuid::new_v4().to_string(),project_id:project.id,title:"Older residents' city-service access — UNAPPROVED draft".into(),description:"Illustrative questions written for development, not the approved ICSSR instrument. Replace study information, consent wording, age categories and city list using the approved research protocol. Do not collect participant data until the research team has reviewed and published a version.".into(),version:1,status:"draft".into(),questions,reviewed:false};
    db.execute(
        "INSERT INTO forms(id,project_id,lineage_id,data) VALUES(?1,?2,?1,?3)",
        params![
            form.id,
            form.project_id,
            serde_json::to_string(&form).unwrap()
        ],
    )
    .map_err(|e| e.to_string())?;
    Ok(())
}
fn q(id: &str, label: &str, kind: &str, required: bool, choices: Vec<(&str, &str)>) -> Question {
    Question {
        id: id.into(),
        label: label.into(),
        kind: kind.into(),
        required,
        choices: choices
            .into_iter()
            .map(|(code, label)| Choice {
                code: code.into(),
                label: label.into(),
            })
            .collect(),
        min: None,
        max: None,
        show_if: None,
    }
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
        .filter_map(|r| r.ok())
        .collect();
    for pid in &pids {
        let _ = db.execute(
            "INSERT OR IGNORE INTO memberships(project_id,user_id) VALUES(?1,?2)",
            params![pid, uid],
        );
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
    Ok((user, org))
}
