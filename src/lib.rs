pub mod api;
pub mod auth;
pub mod db;
pub mod export;
pub mod import;
pub mod models;
pub mod validation;

use rusqlite::Connection;
use std::sync::{Arc, Mutex};

#[derive(Clone)]
pub struct AppState {
    pub db: Arc<Mutex<Connection>>,
    pub secure_cookies: bool,
}
