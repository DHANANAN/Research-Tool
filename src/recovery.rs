//! Recovery is an operator-only command, never a public unauthenticated endpoint.
use crate::auth;
use rusqlite::{Connection, OpenFlags, OptionalExtension, params};

pub fn recover(path: &str, login: &str) -> Result<String, String> {
    let mut db = Connection::open_with_flags(path, OpenFlags::SQLITE_OPEN_READ_WRITE)
        .map_err(|_| "Open an existing research database to recover an account.".to_owned())?;
    db.busy_timeout(std::time::Duration::from_secs(5))
        .map_err(|e| e.to_string())?;
    let tx = db.transaction().map_err(|e| e.to_string())?;
    let uid: String = tx
        .query_row("SELECT id FROM users WHERE login_id=?1", [login], |r| {
            r.get(0)
        })
        .optional()
        .map_err(|e| e.to_string())?
        .ok_or("Account not found.")?;
    let code = auth::random_secret();
    tx.execute("UPDATE users SET active=0,password_hash=NULL,activation_hash=?1,activation_expires=?2 WHERE id=?3",
        params![auth::digest(&code), chrono::Utc::now().timestamp() + 3600, uid]).map_err(|e| e.to_string())?;
    tx.execute("DELETE FROM sessions WHERE user_id=?1", [&uid])
        .map_err(|e| e.to_string())?;
    tx.execute("DELETE FROM login_attempts WHERE login_id=?1", [login])
        .map_err(|e| e.to_string())?;
    tx.execute("INSERT INTO audit_events(id,actor_id,action,record_id,created_at) VALUES(?1,NULL,'operator.account_recovery',?2,?3)",
        params![uuid::Uuid::new_v4().to_string(), uid, chrono::Utc::now().to_rfc3339()]).map_err(|e| e.to_string())?;
    tx.commit().map_err(|e| e.to_string())?;
    Ok(code)
}
