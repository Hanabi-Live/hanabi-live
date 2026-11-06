use super::*;
use axum::{
    body::{Body, to_bytes},
    http::Request,
};
use serde_json::Value;
use tower::ServiceExt;

pub(super) fn config() -> AccountConfig {
    AccountConfig {
        secret: "synthetic-account-test-signing-key".into(),
        domain: "example.invalid".into(),
        use_tls: true,
        version: "42".into(),
        is_dev: false,
    }
}

pub(super) async fn request(
    app: &Router,
    method: &str,
    path: &str,
    body: &str,
    cookie: Option<&str>,
    json_body: bool,
) -> (StatusCode, HeaderMap, String) {
    let mut request = Request::builder()
        .method(method)
        .uri(path)
        .header(
            header::CONTENT_TYPE,
            if json_body {
                "application/json"
            } else {
                "application/x-www-form-urlencoded"
            },
        )
        .extension(ConnectInfo(
            "127.0.0.1:12345".parse::<SocketAddr>().unwrap(),
        ));
    if let Some(cookie) = cookie {
        request = request.header(header::COOKIE, cookie);
    }
    let response = app
        .clone()
        .oneshot(request.body(Body::from(body.to_owned())).unwrap())
        .await
        .unwrap();
    let status = response.status();
    let headers = response.headers().clone();
    let body = String::from_utf8(
        to_bytes(response.into_body(), 65536)
            .await
            .unwrap()
            .to_vec(),
    )
    .unwrap();
    (status, headers, body)
}

#[test]
fn go_chat_fixtures() {
    let rows: Vec<Value> =
        serde_json::from_str(include_str!("../../testdata/chat_protocol.json")).unwrap();
    for row in rows {
        let result = normalize_chat(row["input"].as_str().unwrap());
        assert_eq!(
            result.is_ok(),
            row["valid"].as_bool().unwrap(),
            "{}",
            row["name"]
        );
        if let Ok(value) = result {
            assert_eq!(value, row["normalized"].as_str().unwrap());
        }
    }
}

#[tokio::test]
async fn login_requires_matching_release_sha_or_bot_postgres() {
    let Some(db) = test_support::TestDb::create().await else {
        return;
    };
    let version = "a".repeat(40);
    let app = router(
        db.pool.clone(),
        AccountConfig {
            version: version.clone(),
            ..config()
        },
    );
    for submitted in [&version, "bot"] {
        let (status, _, _) = request(
            &app,
            "POST",
            "/login",
            &format!("username=Alice&password=test&version={submitted}"),
            None,
            false,
        )
        .await;
        assert_eq!(status, StatusCode::OK);
    }
    for submitted in ["b".repeat(40), "42".into(), version[..12].into()] {
        let (status, _, body) = request(
            &app,
            "POST",
            "/login",
            &format!("username=Alice&password=test&version={submitted}"),
            None,
            false,
        )
        .await;
        assert_eq!(status, StatusCode::UNAUTHORIZED);
        assert!(body.contains("outdated version"));
        assert!(body.contains(&version));
    }
    db.close().await;
}

#[tokio::test]
async fn native_accounts_http_and_identity_postgres() {
    let Some(db) = test_support::TestDb::create().await else {
        return;
    };
    let app = router(db.pool.clone(), config());
    assert_eq!(
        request(&app, "GET", "/test-cookie", "", None, false)
            .await
            .0,
        StatusCode::NO_CONTENT
    );
    assert_eq!(
        request(
            &app,
            "POST",
            "/login",
            "username=Alice&password=old&version=bad",
            None,
            false
        )
        .await
        .0,
        StatusCode::UNAUTHORIZED
    );
    let (status, headers, _) = request(
        &app,
        "POST",
        "/login",
        "username=Alice&password=old&version=42",
        None,
        false,
    )
    .await;
    assert_eq!(status, StatusCode::OK);
    let header = headers[header::SET_COOKIE].to_str().unwrap();
    for required in [
        "HttpOnly",
        "SameSite=Strict",
        "Domain=example.invalid",
        "Secure",
        "Max-Age=31536000",
    ] {
        assert!(header.contains(required));
    }
    let cookie = header.split(';').next().unwrap();
    assert_eq!(
        request(&app, "GET", "/test-cookie", "", Some(cookie), false)
            .await
            .0,
        StatusCode::OK
    );
    let id: i32 = sqlx::query_scalar("SELECT id FROM users WHERE username='Alice'")
        .fetch_one(&db.pool)
        .await
        .unwrap();
    assert_eq!(
        crate::cookie::decode(
            cookie.split_once('=').unwrap().1,
            &config().secret,
            Utc::now().timestamp()
        )
        .unwrap(),
        id
    );
    assert_eq!(
        request(
            &app,
            "POST",
            "/login",
            "username=alice&password=old&version=42",
            None,
            false
        )
        .await
        .0,
        StatusCode::UNAUTHORIZED
    );
    assert_eq!(
        request(
            &app,
            "POST",
            "/login",
            "username=Alice&password=wrong&version=42",
            None,
            false
        )
        .await
        .0,
        StatusCode::UNAUTHORIZED
    );
    assert_eq!(
        request(
            &app,
            "POST",
            "/login",
            "username=Alice&password=old&newPassword=new&version=bot",
            None,
            false
        )
        .await
        .0,
        StatusCode::OK
    );
    assert_eq!(
        request(
            &app,
            "POST",
            "/login",
            "username=Alice&password=old&version=42",
            None,
            false
        )
        .await
        .0,
        StatusCode::UNAUTHORIZED
    );
    assert_eq!(
        request(
            &app,
            "POST",
            "/login",
            "username=Alice&password=new&version=42",
            None,
            false
        )
        .await
        .0,
        StatusCode::OK
    );
    let legacy = hex::encode(sha2::Sha256::digest("Hanabi password legacy"));
    sqlx::query("ALTER TABLE users ALTER COLUMN password_hash DROP NOT NULL")
        .execute(&db.pool)
        .await
        .unwrap();
    sqlx::query("UPDATE users SET old_password_hash=$1,password_hash=NULL WHERE id=$2")
        .bind(legacy)
        .bind(id)
        .execute(&db.pool)
        .await
        .unwrap();
    assert_eq!(
        request(
            &app,
            "POST",
            "/login",
            "username=Alice&password=legacy&version=42",
            None,
            false
        )
        .await
        .0,
        StatusCode::OK
    );
    let row = sqlx::query("SELECT old_password_hash,password_hash FROM users WHERE id=$1")
        .bind(id)
        .fetch_one(&db.pool)
        .await
        .unwrap();
    assert!(row.get::<Option<String>, _>("old_password_hash").is_none());
    assert!(
        verify_password("legacy".into(), row.get("password_hash"))
            .await
            .unwrap()
    );
    assert_eq!(
        request(&app, "GET", "/api/v1/identity/token", "", None, false)
            .await
            .0,
        StatusCode::UNAUTHORIZED
    );
    let (status, _, body) = request(
        &app,
        "GET",
        "/api/v1/identity/token",
        "",
        Some(cookie),
        false,
    )
    .await;
    assert_eq!(status, StatusCode::OK);
    let token: Value = serde_json::from_str(&body).unwrap();
    assert_eq!(token["username"], "Alice");
    assert_eq!(token["token"].as_str().unwrap().len(), 128);
    let lookup = json!({"token":token["token"]}).to_string();
    assert_eq!(
        request(&app, "POST", "/api/v1/identity", &lookup, None, true)
            .await
            .0,
        StatusCode::OK
    );
    let (_, _, body) = request(
        &app,
        "POST",
        "/api/v1/identity/token",
        "",
        Some(cookie),
        false,
    )
    .await;
    let replacement: Value = serde_json::from_str(&body).unwrap();
    assert_ne!(replacement["token"], token["token"]);
    assert_eq!(
        request(&app, "POST", "/api/v1/identity", &lookup, None, true)
            .await
            .0,
        StatusCode::NOT_FOUND
    );
    sqlx::query("UPDATE user_identity_tokens SET expires_at=NOW() WHERE user_id=$1")
        .bind(id)
        .execute(&db.pool)
        .await
        .unwrap();
    assert_eq!(
        request(
            &app,
            "POST",
            "/api/v1/identity",
            &json!({"token":replacement["token"]}).to_string(),
            None,
            true
        )
        .await
        .0,
        StatusCode::NOT_FOUND
    );
    assert_eq!(
        request(&app, "POST", "/api/v1/identity", "broken", None, true)
            .await
            .0,
        StatusCode::BAD_REQUEST
    );
    sqlx::query("INSERT INTO banned_ips(ip) VALUES('127.0.0.1')")
        .execute(&db.pool)
        .await
        .unwrap();
    assert_eq!(
        request(
            &app,
            "POST",
            "/login",
            "username=Alice&password=legacy&version=42",
            None,
            false
        )
        .await
        .0,
        StatusCode::UNAUTHORIZED
    );
    assert_eq!(
        request(
            &app,
            "GET",
            "/api/v1/identity/token",
            "",
            Some(cookie),
            false
        )
        .await
        .0,
        StatusCode::BAD_REQUEST
    );
    let (status, headers, _) = request(&app, "GET", "/logout?dev", "", Some(cookie), false).await;
    assert_eq!(status, StatusCode::MOVED_PERMANENTLY);
    assert_eq!(headers[header::CACHE_CONTROL], "no-store");
    assert_eq!(headers[header::LOCATION], "/?dev");
    assert!(
        headers[header::SET_COOKIE]
            .to_str()
            .unwrap()
            .contains("Max-Age=0")
    );
    db.close().await;
}

#[tokio::test]
async fn seven_concurrent_account_registrations_and_logins_postgres() {
    let Some(db) = test_support::TestDb::create().await else {
        return;
    };
    let app = router(db.pool.clone(), config());
    for phase in ["registration", "login"] {
        let results = tokio::time::timeout(
            std::time::Duration::from_secs(25),
            futures_util::future::join_all((0..7).map(|index| {
                let app = &app;
                async move {
                    let body = url::form_urlencoded::Serializer::new(String::new())
                        .append_pair("username", &format!("Burst{index}"))
                        .append_pair("password", "synthetic-concurrency-password")
                        .append_pair("version", "42")
                        .finish();
                    request(app, "POST", "/login", &body, None, false).await
                }
            })),
        )
        .await
        .expect("A legitimate account burst should finish within the HTTP request deadline");
        let failures: Vec<_> = results
            .iter()
            .enumerate()
            .filter(|(_, response)| response.0 != StatusCode::OK)
            .map(|(index, response)| (index, response.0, response.2.clone()))
            .collect();
        if !failures.is_empty() {
            db.close().await;
            panic!("Concurrent {phase} failed: {failures:?}");
        }
        let ids: std::collections::HashSet<_> = results
            .iter()
            .map(|(_, headers, _)| {
                session_id(
                    &HeaderMap::from_iter([(
                        header::COOKIE,
                        headers[header::SET_COOKIE]
                            .to_str()
                            .unwrap()
                            .split(';')
                            .next()
                            .unwrap()
                            .parse()
                            .unwrap(),
                    )]),
                    &config().secret,
                )
                .unwrap()
            })
            .collect();
        assert_eq!(ids.len(), 7);
    }
    assert_eq!(
        sqlx::query_scalar::<_, i64>("SELECT COUNT(*) FROM users")
            .fetch_one(&db.pool)
            .await
            .unwrap(),
        7
    );
    db.close().await;
}

#[tokio::test]
async fn password_overload_is_retryable_and_diagnostics_are_redacted() {
    for reason in [
        HashOverload::QueueFull,
        HashOverload::WaitExpired,
        HashOverload::Unavailable,
    ] {
        for json_response in [false, true] {
            let response = account_failure("test", reason.into(), json_response);
            assert_eq!(response.status(), StatusCode::SERVICE_UNAVAILABLE);
            assert_eq!(response.headers()[header::RETRY_AFTER], "1");
            let body =
                String::from_utf8(to_bytes(response.into_body(), 1024).await.unwrap().to_vec())
                    .unwrap();
            assert!(body.contains("temporarily busy"));
            if json_response {
                assert!(serde_json::from_str::<Value>(&body).unwrap()["error"].is_string());
            }
        }
    }
    let error = anyhow::anyhow!("synthetic-sensitive-password-token-and-query");
    assert!(!failure_diagnostic(&error).contains("synthetic-sensitive"));
    let response = account_failure("test", error, false);
    assert_eq!(response.status(), StatusCode::INTERNAL_SERVER_ERROR);
    let body =
        String::from_utf8(to_bytes(response.into_body(), 1024).await.unwrap().to_vec()).unwrap();
    assert!(!body.contains("synthetic-sensitive"));
}

use sha2::Digest;
use sqlx::Row;
