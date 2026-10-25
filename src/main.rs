use research_tool::{api, db};
#[tokio::main]
async fn main() {
    let path =
        std::env::var("RESEARCH_DB_PATH").unwrap_or_else(|_| ".local/research.sqlite3".into());
    let login = std::env::var("RESEARCH_ADMIN_ID").ok();
    let password = std::env::var("RESEARCH_ADMIN_PASSWORD").ok();
    let name =
        std::env::var("RESEARCH_ADMIN_NAME").unwrap_or_else(|_| "Research administrator".into());
    let admin = login
        .as_deref()
        .zip(password.as_deref())
        .map(|(l, p)| (l, p, name.as_str()));
    let secure = std::env::var("RESEARCH_SECURE_COOKIES").is_ok_and(|v| v == "true");
    let state = match db::initialize(&path, admin, secure) {
        Ok(s) => s,
        Err(e) => {
            eprintln!("Startup failed: {e}");
            std::process::exit(1)
        }
    };
    if std::env::var("RESEARCH_DEMO_ACCOUNTS").is_ok_and(|value| value == "true")
        && let Err(error) = db::enable_demo_accounts(&state)
    {
        eprintln!("Demo setup failed: {error}");
        std::process::exit(1);
    }
    let bind = std::env::var("RESEARCH_BIND").unwrap_or_else(|_| {
        std::env::var("PORT")
            .map(|port| format!("0.0.0.0:{port}"))
            .unwrap_or_else(|_| "127.0.0.1:3000".into())
    });
    let listener = match tokio::net::TcpListener::bind(&bind).await {
        Ok(v) => v,
        Err(e) => {
            eprintln!("Cannot bind research server: {e}");
            std::process::exit(1)
        }
    };
    println!("Research-Tool listening on {bind}");
    if let Err(e) = axum::serve(listener, api::router(state))
        .with_graceful_shutdown(async {
            let _ = tokio::signal::ctrl_c().await;
        })
        .await
    {
        eprintln!("Server failed: {e}");
        std::process::exit(1)
    }
}
