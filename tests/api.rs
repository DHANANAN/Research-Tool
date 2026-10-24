use axum::{
    body::Body,
    http::{Request, StatusCode},
};
use http_body_util::BodyExt;
use research_tool::{AppState, api, db};
use serde_json::{Value, json};
use tower::ServiceExt;

fn setup() -> (axum::Router, AppState) {
    let state = db::initialize(
        ":memory:",
        Some(("admin", "correct horse battery staple", "Administrator")),
        false,
    )
    .unwrap();
    (api::router(state.clone()), state)
}
async fn request(
    app: &axum::Router,
    method: &str,
    path: &str,
    body: Value,
    cookie: Option<&str>,
) -> (StatusCode, Value, Option<String>) {
    let mut builder = Request::builder()
        .method(method)
        .uri(path)
        .header("content-type", "application/json")
        .header("x-research-client", "1");
    if let Some(cookie) = cookie {
        builder = builder.header("cookie", cookie);
    }
    let response = app
        .clone()
        .oneshot(builder.body(Body::from(body.to_string())).unwrap())
        .await
        .unwrap();
    let status = response.status();
    let session = response
        .headers()
        .get("set-cookie")
        .and_then(|v| v.to_str().ok())
        .map(String::from);
    let bytes = response.into_body().collect().await.unwrap().to_bytes();
    let value = serde_json::from_slice(&bytes).unwrap_or(Value::Null);
    (status, value, session)
}
async fn login(app: &axum::Router) -> String {
    let (status, _, cookie) = request(
        app,
        "POST",
        "/api/auth/login",
        json!({"login_id":"admin","password":"correct horse battery staple"}),
        None,
    )
    .await;
    assert_eq!(status, StatusCode::OK);
    cookie.unwrap()
}
fn question() -> Value {
    json!({"id":"q_count","label":"Count","kind":"integer","required":true,"choices":[],"min":0})
}
async fn make_form(app: &axum::Router, cookie: &str, pid: &str) -> String {
    let(s,v,_)=request(app,"POST",&format!("/api/projects/{pid}/forms"),json!({"title":"Fixture","description":"Fictional data","questions":[question()],"reviewed":true}),Some(cookie)).await;
    assert_eq!(s, StatusCode::OK, "{v}");
    v["id"].as_str().unwrap().into()
}

#[tokio::test]
async fn auth_and_csrf_are_enforced() {
    let (app, _) = setup();
    let (status, _, _) = request(&app, "GET", "/api/bootstrap", json!({}), None).await;
    assert_eq!(status, StatusCode::UNAUTHORIZED);
    let response = app
        .clone()
        .oneshot(
            Request::builder()
                .method("POST")
                .uri("/api/auth/login")
                .header("content-type", "application/json")
                .body(Body::from("{}"))
                .unwrap(),
        )
        .await
        .unwrap();
    assert_eq!(response.status(), StatusCode::FORBIDDEN);
    assert_eq!(response.headers()["cache-control"], "no-store");
    let cookie = login(&app).await;
    assert!(cookie.contains("HttpOnly"));
    assert!(cookie.contains("SameSite=Lax"));
    assert_eq!(
        request(&app, "POST", "/api/auth/logout", json!({}), Some(&cookie))
            .await
            .0,
        StatusCode::OK
    );
    assert_eq!(
        request(&app, "GET", "/api/bootstrap", json!({}), Some(&cookie))
            .await
            .0,
        StatusCode::UNAUTHORIZED
    );
}
#[tokio::test]
async fn activation_is_one_time_and_surveyors_have_project_isolation() {
    let (app, _) = setup();
    let admin = login(&app).await;
    let (_, boot, _) = request(&app, "GET", "/api/bootstrap", json!({}), Some(&admin)).await;
    let pid = boot["projects"][0]["id"].as_str().unwrap();
    let (_, invitation, _) = request(
        &app,
        "POST",
        &format!("/api/projects/{pid}/members"),
        json!({"login_id":"team_001","name":"Fictional collector"}),
        Some(&admin),
    )
    .await;
    let activation = json!({"login_id":"team_001","activation_code":invitation["activation_code"],"password":"collector test password"});
    let (status, _, cookie) =
        request(&app, "POST", "/api/auth/activate", activation.clone(), None).await;
    assert_eq!(status, StatusCode::OK);
    let collector = cookie.unwrap();
    assert_eq!(
        request(&app, "POST", "/api/auth/activate", activation, None)
            .await
            .0,
        StatusCode::UNAUTHORIZED
    );
    assert_eq!(
        request(
            &app,
            "GET",
            &format!("/api/projects/{pid}/export.xlsx"),
            json!({}),
            Some(&collector)
        )
        .await
        .0,
        StatusCode::FORBIDDEN
    );
    let (_, other, _) = request(
        &app,
        "POST",
        "/api/projects",
        json!({"name":"Another team","cities":[]}),
        Some(&admin),
    )
    .await;
    let other_id = other["id"].as_str().unwrap();
    assert_eq!(
        request(
            &app,
            "GET",
            &format!("/api/projects/{other_id}/responses"),
            json!({}),
            Some(&collector)
        )
        .await
        .0,
        StatusCode::NOT_FOUND
    );
    let (_, boot, _) = request(&app, "GET", "/api/bootstrap", json!({}), Some(&collector)).await;
    assert_eq!(boot["projects"].as_array().unwrap().len(), 1);
    assert!(
        boot["forms"].as_array().unwrap().is_empty(),
        "Unpublished forms must stay private"
    );
}
#[tokio::test]
async fn publish_versions_validation_and_duplicate_receipts() {
    let (app, _) = setup();
    let cookie = login(&app).await;
    let (_, boot, _) = request(&app, "GET", "/api/bootstrap", json!({}), Some(&cookie)).await;
    let pid = boot["projects"][0]["id"].as_str().unwrap();
    let fid = make_form(&app, &cookie, pid).await;
    assert_eq!(
        request(
            &app,
            "POST",
            &format!("/api/forms/{fid}/publish"),
            json!({}),
            Some(&cookie)
        )
        .await
        .0,
        StatusCode::OK
    );
    assert_eq!(
        request(
            &app,
            "PUT",
            &format!("/api/forms/{fid}"),
            json!({"title":"Changed","questions":[question()],"reviewed":true}),
            Some(&cookie)
        )
        .await
        .0,
        StatusCode::CONFLICT
    );
    let body = json!({"id":uuid::Uuid::new_v4().to_string(),"form_id":fid,"expected_user_id":boot["user"]["id"],"collected_at":"2026-10-25T05:30:00+05:30","timezone":"Asia/Kolkata","answers":{"q_count":0}});
    let mut wrong_owner = body.clone();
    wrong_owner["expected_user_id"] = json!("another-account");
    assert_eq!(
        request(&app, "POST", "/api/responses", wrong_owner, Some(&cookie))
            .await
            .0,
        StatusCode::FORBIDDEN
    );
    let mut missing = body.clone();
    missing["id"] = json!(uuid::Uuid::new_v4().to_string());
    missing["answers"] = json!({});
    assert_eq!(
        request(&app, "POST", "/api/responses", missing, Some(&cookie))
            .await
            .0,
        StatusCode::BAD_REQUEST
    );
    let (s, result, _) = request(&app, "POST", "/api/responses", body.clone(), Some(&cookie)).await;
    assert_eq!(s, StatusCode::OK, "{result}");
    assert_eq!(result["duplicate"], false);
    let (s, result, _) = request(&app, "POST", "/api/responses", body.clone(), Some(&cookie)).await;
    assert_eq!(s, StatusCode::OK);
    assert_eq!(result["duplicate"], true);
    let mut altered = body.clone();
    altered["answers"]["q_count"] = json!(1);
    assert_eq!(
        request(&app, "POST", "/api/responses", altered, Some(&cookie))
            .await
            .0,
        StatusCode::CONFLICT
    );
    let (_, records, _) = request(
        &app,
        "GET",
        &format!("/api/projects/{pid}/responses"),
        json!({}),
        Some(&cookie),
    )
    .await;
    assert_eq!(records.as_array().unwrap().len(), 1);
    assert_eq!(records[0]["answers"]["q_count"], 0);
    assert_eq!(records[0]["collected_at"], "2026-10-25T00:00:00.000Z");
    let (s, revision, _) = request(
        &app,
        "POST",
        &format!("/api/forms/{fid}/revise"),
        json!({}),
        Some(&cookie),
    )
    .await;
    assert_eq!(s, StatusCode::OK);
    assert_eq!(revision["version"], 2);
    assert_eq!(revision["status"], "draft");
    assert_ne!(revision["id"], fid);
    assert_eq!(
        request(
            &app,
            "POST",
            &format!("/api/forms/{fid}/close"),
            json!({}),
            Some(&cookie)
        )
        .await
        .0,
        StatusCode::OK
    );
    assert_eq!(
        request(&app, "POST", "/api/responses", body.clone(), Some(&cookie))
            .await
            .0,
        StatusCode::OK,
        "Acknowledged retries still get their receipt after closure"
    );
    let mut new = body;
    new["id"] = json!(uuid::Uuid::new_v4().to_string());
    assert_eq!(
        request(&app, "POST", "/api/responses", new, Some(&cookie))
            .await
            .0,
        StatusCode::CONFLICT
    );
}
#[tokio::test]
async fn unknown_question_types_cannot_be_published() {
    let (app, _) = setup();
    let cookie = login(&app).await;
    let (_, boot, _) = request(&app, "GET", "/api/bootstrap", json!({}), Some(&cookie)).await;
    let pid = boot["projects"][0]["id"].as_str().unwrap();
    let (status,_,_)=request(&app,"POST",&format!("/api/projects/{pid}/forms"),json!({"title":"Invalid","questions":[{"id":"q_bad","label":"Unsupported","kind":"matrix"}],"reviewed":true}),Some(&cookie)).await;
    assert_eq!(status, StatusCode::BAD_REQUEST);
}

#[tokio::test]
async fn collected_records_survive_database_reopen() {
    let directory = tempfile::tempdir().unwrap();
    let path = directory.path().join("research.sqlite3");
    let path = path.to_str().unwrap();
    let state = db::initialize(
        path,
        Some(("admin", "correct horse battery staple", "Administrator")),
        false,
    )
    .unwrap();
    let app = api::router(state);
    let cookie = login(&app).await;
    let (_, boot, _) = request(&app, "GET", "/api/bootstrap", json!({}), Some(&cookie)).await;
    let pid = boot["projects"][0]["id"].as_str().unwrap();
    let fid = make_form(&app, &cookie, pid).await;
    assert_eq!(
        request(
            &app,
            "POST",
            &format!("/api/forms/{fid}/publish"),
            json!({}),
            Some(&cookie)
        )
        .await
        .0,
        StatusCode::OK
    );
    let body = json!({"id":uuid::Uuid::new_v4().to_string(),"expected_user_id":boot["user"]["id"],"form_id":fid,"collected_at":"2026-10-25T00:00:00Z","timezone":"UTC","answers":{"q_count":7}});
    assert_eq!(
        request(&app, "POST", "/api/responses", body.clone(), Some(&cookie))
            .await
            .0,
        StatusCode::OK
    );
    let project_id = pid.to_string();
    drop(app);
    let reopened = api::router(db::initialize(path, None, false).unwrap());
    let cookie = login(&reopened).await;
    let (status, responses, _) = request(
        &reopened,
        "GET",
        &format!("/api/projects/{project_id}/responses"),
        json!({}),
        Some(&cookie),
    )
    .await;
    assert_eq!(status, StatusCode::OK);
    assert_eq!(responses.as_array().unwrap().len(), 1);
    assert_eq!(responses[0]["id"], body["id"]);
    assert_eq!(responses[0]["answers"]["q_count"], 7);
}

#[tokio::test]
async fn same_collector_can_join_owned_studies_without_reset_or_foreign_account_claims() {
    let (app, state) = setup();
    let admin = login(&app).await;
    let (_, boot, _) = request(&app, "GET", "/api/bootstrap", json!({}), Some(&admin)).await;
    let first = boot["projects"][0]["id"].as_str().unwrap();
    let (_, invitation, _) = request(
        &app,
        "POST",
        &format!("/api/projects/{first}/members"),
        json!({"login_id":"shared_collector","name":"Original collector name"}),
        Some(&admin),
    )
    .await;
    let collector_id = invitation["user"]["id"].as_str().unwrap();
    let (_, second, _) = request(
        &app,
        "POST",
        "/api/projects",
        json!({"name":"Second study"}),
        Some(&admin),
    )
    .await;
    let second_id = second["id"].as_str().unwrap();
    for _ in 0..2 {
        let (status, assigned, _) = request(
            &app,
            "POST",
            &format!("/api/projects/{second_id}/members"),
            json!({"login_id":"shared_collector","name":"Do not rename or reset"}),
            Some(&admin),
        )
        .await;
        assert_eq!(status, StatusCode::OK);
        assert_eq!(assigned["user"]["id"], collector_id);
        assert_eq!(assigned["user"]["name"], "Original collector name");
        assert!(assigned["activation_code"].is_null());
        assert_eq!(assigned["existing"], true);
    }
    let(status,_,collector_cookie)=request(&app,"POST","/api/auth/activate",json!({"login_id":"shared_collector","activation_code":invitation["activation_code"],"password":"shared collector password"}),None).await;
    assert_eq!(
        status,
        StatusCode::OK,
        "Attaching a pending account must not replace its activation token"
    );
    let collector_cookie = collector_cookie.unwrap();
    let (_, collector_boot, _) = request(
        &app,
        "GET",
        "/api/bootstrap",
        json!({}),
        Some(&collector_cookie),
    )
    .await;
    assert_eq!(collector_boot["projects"].as_array().unwrap().len(), 2);
    let (_, active_assignment, _) = request(
        &app,
        "POST",
        &format!("/api/projects/{second_id}/members"),
        json!({"login_id":"shared_collector","name":"Ignored name"}),
        Some(&admin),
    )
    .await;
    assert!(active_assignment["activation_code"].is_null());
    let fid = make_form(&app, &admin, second_id).await;
    assert_eq!(
        request(
            &app,
            "POST",
            &format!("/api/forms/{fid}/publish"),
            json!({}),
            Some(&admin)
        )
        .await
        .0,
        StatusCode::OK
    );
    let(status,receipt,_)=request(&app,"POST","/api/responses",json!({"id":uuid::Uuid::new_v4().to_string(),"expected_user_id":collector_id,"form_id":fid,"collected_at":"2026-10-25T00:00:00Z","timezone":"UTC","answers":{"q_count":3}}),Some(&collector_cookie)).await;
    assert_eq!(status, StatusCode::OK);
    assert_eq!(receipt["collector_id"], collector_id);
    let (_, responses, _) = request(
        &app,
        "GET",
        &format!("/api/projects/{second_id}/responses"),
        json!({}),
        Some(&admin),
    )
    .await;
    assert_eq!(responses[0]["collector_id"], collector_id);

    let second_admin_id = uuid::Uuid::new_v4().to_string();
    let hash = research_tool::auth::hash_password("another administrator password").unwrap();
    state.db.lock().unwrap().execute("INSERT INTO users(id,login_id,name,role,password_hash,active) VALUES(?1,'other_admin','Other administrator','admin',?2,1)",rusqlite::params![second_admin_id,hash]).unwrap();
    let (status, _, other_cookie) = request(
        &app,
        "POST",
        "/api/auth/login",
        json!({"login_id":"other_admin","password":"another administrator password"}),
        None,
    )
    .await;
    assert_eq!(status, StatusCode::OK);
    let other_cookie = other_cookie.unwrap();
    let (_, foreign_project, _) = request(
        &app,
        "POST",
        "/api/projects",
        json!({"name":"Private unrelated study"}),
        Some(&other_cookie),
    )
    .await;
    let foreign_id = foreign_project["id"].as_str().unwrap();
    let (status, rejected, _) = request(
        &app,
        "POST",
        &format!("/api/projects/{foreign_id}/members"),
        json!({"login_id":"shared_collector","name":"Claim someone else's collector"}),
        Some(&other_cookie),
    )
    .await;
    assert_eq!(status, StatusCode::CONFLICT);
    assert!(rejected.get("user").is_none());
    assert!(!rejected.to_string().contains("Original collector name"));
    let (_, foreign_invitation, _) = request(
        &app,
        "POST",
        &format!("/api/projects/{foreign_id}/members"),
        json!({"login_id":"foreign_collector","name":"Private collector name"}),
        Some(&other_cookie),
    )
    .await;
    assert!(foreign_invitation["activation_code"].is_string());
    assert_eq!(
        request(
            &app,
            "POST",
            &format!("/api/projects/{second_id}/members"),
            json!({"login_id":"foreign_collector","name":"Claim unrelated collector"}),
            Some(&admin)
        )
        .await
        .0,
        StatusCode::CONFLICT
    );
    let (_, unchanged, _) = request(
        &app,
        "GET",
        "/api/bootstrap",
        json!({}),
        Some(&collector_cookie),
    )
    .await;
    assert_eq!(unchanged["projects"].as_array().unwrap().len(), 2);
}

#[tokio::test]
async fn project_metadata_edit_is_durable_and_preserves_research_records_and_permissions() {
    let directory = tempfile::tempdir().unwrap();
    let path = directory.path().join("research.sqlite3");
    let path = path.to_str().unwrap();
    let state = db::initialize(
        path,
        Some(("admin", "correct horse battery staple", "Administrator")),
        false,
    )
    .unwrap();
    let app = api::router(state.clone());
    let admin = login(&app).await;
    let (_, boot, _) = request(&app, "GET", "/api/bootstrap", json!({}), Some(&admin)).await;
    let pid = boot["projects"][0]["id"].as_str().unwrap().to_string();
    let fid = make_form(&app, &admin, &pid).await;
    assert_eq!(
        request(
            &app,
            "POST",
            &format!("/api/forms/{fid}/publish"),
            json!({}),
            Some(&admin)
        )
        .await
        .0,
        StatusCode::OK
    );
    let (_, invitation, _) = request(
        &app,
        "POST",
        &format!("/api/projects/{pid}/members"),
        json!({"login_id":"edit_test_collector","name":"Fictional collector"}),
        Some(&admin),
    )
    .await;
    let(_,_,collector_cookie)=request(&app,"POST","/api/auth/activate",json!({"login_id":"edit_test_collector","activation_code":invitation["activation_code"],"password":"collector test password"}),None).await;
    let collector_cookie = collector_cookie.unwrap();
    let body = json!({"id":uuid::Uuid::new_v4().to_string(),"expected_user_id":invitation["user"]["id"],"form_id":fid,"collected_at":"2026-10-25T00:00:00Z","timezone":"UTC","answers":{"q_count":12}});
    assert_eq!(
        request(
            &app,
            "POST",
            "/api/responses",
            body.clone(),
            Some(&collector_cookie)
        )
        .await
        .0,
        StatusCode::OK
    );
    let edited = json!({"name":"Universal study, renamed","description":"Editable study context","cities":["Fictional location A","Fictional location B"]});
    assert_eq!(
        request(
            &app,
            "PUT",
            &format!("/api/projects/{pid}"),
            edited.clone(),
            Some(&collector_cookie)
        )
        .await
        .0,
        StatusCode::FORBIDDEN
    );
    let other_id = uuid::Uuid::new_v4().to_string();
    let hash = research_tool::auth::hash_password("another administrator password").unwrap();
    state.db.lock().unwrap().execute("INSERT INTO users(id,login_id,name,role,password_hash,active) VALUES(?1,'edit_other_admin','Other administrator','admin',?2,1)",rusqlite::params![other_id,hash]).unwrap();
    let (_, _, other_cookie) = request(
        &app,
        "POST",
        "/api/auth/login",
        json!({"login_id":"edit_other_admin","password":"another administrator password"}),
        None,
    )
    .await;
    assert_eq!(
        request(
            &app,
            "PUT",
            &format!("/api/projects/{pid}"),
            edited.clone(),
            other_cookie.as_deref()
        )
        .await
        .0,
        StatusCode::NOT_FOUND
    );
    let (status, result, _) = request(
        &app,
        "PUT",
        &format!("/api/projects/{pid}"),
        edited.clone(),
        Some(&admin),
    )
    .await;
    assert_eq!(status, StatusCode::OK);
    assert_eq!(result["id"], pid);
    assert_eq!(result["cities"], edited["cities"]);
    assert_eq!(
        request(
            &app,
            "PUT",
            &format!("/api/projects/{pid}"),
            json!({"name":"","cities":[]}),
            Some(&admin)
        )
        .await
        .0,
        StatusCode::BAD_REQUEST
    );
    assert_eq!(
        state
            .db
            .lock()
            .unwrap()
            .query_row(
                "SELECT count(*) FROM audit_events WHERE project_id=?1 AND action='project.edit'",
                [&pid],
                |r| r.get::<_, i64>(0)
            )
            .unwrap(),
        1
    );
    let (_, members, _) = request(
        &app,
        "GET",
        &format!("/api/projects/{pid}/members"),
        json!({}),
        Some(&admin),
    )
    .await;
    assert_eq!(members.as_array().unwrap().len(), 2);
    drop(app);
    drop(state);
    let reopened = api::router(db::initialize(path, None, false).unwrap());
    let admin = login(&reopened).await;
    let (_, boot, _) = request(&reopened, "GET", "/api/bootstrap", json!({}), Some(&admin)).await;
    let project = boot["projects"]
        .as_array()
        .unwrap()
        .iter()
        .find(|p| p["id"] == pid)
        .unwrap();
    assert_eq!(project["name"], edited["name"]);
    assert_eq!(project["description"], edited["description"]);
    assert_eq!(project["cities"], edited["cities"]);
    let existing_form = boot["forms"]
        .as_array()
        .unwrap()
        .iter()
        .find(|f| f["id"] == fid)
        .unwrap();
    assert_eq!(existing_form["status"], "published");
    assert_eq!(existing_form["project_id"], pid);
    let (status, responses, _) = request(
        &reopened,
        "GET",
        &format!("/api/projects/{pid}/responses"),
        json!({}),
        Some(&collector_cookie),
    )
    .await;
    assert_eq!(status, StatusCode::OK);
    assert_eq!(responses.as_array().unwrap().len(), 1);
    assert_eq!(responses[0]["id"], body["id"]);
    assert_eq!(responses[0]["answers"]["q_count"], 12);
}
