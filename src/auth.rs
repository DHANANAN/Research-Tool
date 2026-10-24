use crate::{AppState, models::User};
use argon2::{Argon2, PasswordHash, PasswordHasher, PasswordVerifier, password_hash::SaltString};
use axum::http::{HeaderMap, HeaderValue};
use rand::{RngCore, rngs::OsRng};
use rusqlite::params;
use sha2::{Digest, Sha256};

pub fn hash_password(password: &str) -> Result<String, String> {
    if password.len() < 12 || password.len() > 256 {
        return Err("Use a password between 12 and 256 characters.".into());
    }
    let salt = SaltString::generate(&mut OsRng);
    Argon2::default()
        .hash_password(password.as_bytes(), &salt)
        .map(|v| v.to_string())
        .map_err(|_| "Password hashing failed".into())
}
pub fn verify_password(password: &str, hash: &str) -> bool {
    PasswordHash::new(hash).is_ok_and(|parsed| {
        Argon2::default()
            .verify_password(password.as_bytes(), &parsed)
            .is_ok()
    })
}
pub fn random_secret() -> String {
    let mut bytes = [0_u8; 32];
    OsRng.fill_bytes(&mut bytes);
    bytes.iter().map(|b| format!("{b:02x}")).collect()
}
pub fn digest(value: &str) -> String {
    format!("{:x}", Sha256::digest(value.as_bytes()))
}
pub fn token(headers: &HeaderMap) -> Option<String> {
    headers
        .get("cookie")?
        .to_str()
        .ok()?
        .split(';')
        .find_map(|part| {
            part.trim()
                .strip_prefix("research_session=")
                .map(String::from)
        })
}
pub fn current_user(state: &AppState, headers: &HeaderMap) -> Option<User> {
    let token = token(headers)?;
    let db = state.db.lock().ok()?;
    db.query_row("SELECT u.id,u.login_id,u.name,u.role,u.org_id FROM sessions s JOIN users u ON u.id=s.user_id WHERE s.token_hash=?1 AND s.expires>?2 AND u.active=1",params![digest(&token),chrono::Utc::now().timestamp()], |r|Ok(User{id:r.get(0)?,login_id:r.get(1)?,name:r.get(2)?,role:r.get(3)?,org_id:r.get(4)?})).ok()
}
pub fn session(state: &AppState, user: &User) -> Result<HeaderValue, String> {
    let raw = random_secret();
    let db = state.db.lock().map_err(|_| "Database unavailable")?;
    db.execute(
        "DELETE FROM sessions WHERE expires<=?1",
        [chrono::Utc::now().timestamp()],
    )
    .map_err(|_| "Database unavailable")?;
    db.execute(
        "INSERT INTO sessions(token_hash,user_id,expires) VALUES(?1,?2,?3)",
        params![
            digest(&raw),
            user.id,
            chrono::Utc::now().timestamp() + 86400
        ],
    )
    .map_err(|_| "Database unavailable")?;
    let secure = if state.secure_cookies { "; Secure" } else { "" };
    HeaderValue::from_str(&format!(
        "research_session={raw}; HttpOnly; SameSite=Lax; Path=/; Max-Age=86400{secure}"
    ))
    .map_err(|_| "Session creation failed".into())
}
