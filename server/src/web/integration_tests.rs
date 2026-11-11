use super::socket::{Account, bootstrap, load_lobby, lobby_initial};
use super::*;
use crate::transport::test_frame;
use crate::{
    errors::CommandError,
    lobby::{self, Publication},
    transport::{Outgoing, Session},
};
use axum::extract::ws::Message;
use axum::http::HeaderValue;
use futures_util::{SinkExt, StreamExt};
use hanabi_protocol::UserId;
use serde_json::{Value, json};
use std::collections::BTreeSet;
use std::time::Duration;
use tokio::sync::oneshot;
use tokio_tungstenite::{
    connect_async,
    tungstenite::{Message as WireMessage, client::IntoClientRequest},
};
use tower::ServiceExt;

type Socket =
    tokio_tungstenite::WebSocketStream<tokio_tungstenite::MaybeTlsStream<tokio::net::TcpStream>>;

#[tokio::test]
async fn websocket_errors_explain_invalid_fields_and_database_failures_postgres() {
    let Some(fixture) = test_support::Fixture::start().await else {
        return;
    };
    let cookie = login(&fixture, "ErrorDetails").await;
    let mut socket = connect(&fixture, &cookie).await;
    receive(&mut socket, "welcome").await;
    for (request, expected) in [
        (
            "gameHistory {\"offset\":\"bad\",\"amount\":10}",
            "Invalid GameHistoryRequest payload at /offset",
        ),
        (
            "gameHistory {\"offset\":0,\"amount\":10}",
            "database connection pool is closed",
        ),
    ] {
        if request.contains("\"offset\":0") {
            fixture.app.store.primary.close().await;
        }
        socket
            .send(WireMessage::Text(request.into()))
            .await
            .unwrap();
        let warning = tokio::time::timeout(Duration::from_secs(5), async {
            loop {
                let message = socket.next().await.unwrap().unwrap();
                if let WireMessage::Text(text) = message
                    && let Some(body) = text.strip_prefix("warning ")
                {
                    break serde_json::from_str::<Value>(body).unwrap()["message"]
                        .as_str()
                        .unwrap()
                        .to_owned();
                }
            }
        })
        .await
        .unwrap();
        assert!(warning.contains(expected), "{warning}");
        if request.contains("\"offset\":0") {
            assert!(warning.contains("Loading game history"));
            assert!(warning.contains("Reference:"));
        }
    }
    socket.close(None).await.unwrap();
    fixture.close().await;
}

#[tokio::test]
async fn websocket_handshake_database_failure_has_a_diagnostic_response_postgres() {
    let Some(fixture) = test_support::Fixture::start().await else {
        return;
    };
    let cookie = login(&fixture, "HandshakeError").await;
    fixture.app.store.primary.close().await;
    let mut request = format!("ws://{}/ws?version=42", fixture.address)
        .into_client_request()
        .unwrap();
    request
        .headers_mut()
        .insert(header::COOKIE, HeaderValue::from_str(&cookie).unwrap());
    request
        .headers_mut()
        .insert(header::ORIGIN, HeaderValue::from_str(&fixture.url).unwrap());
    let error = connect_async(request).await.unwrap_err();
    let tokio_tungstenite::tungstenite::Error::Http(response) = error else {
        panic!("Expected HTTP rejection");
    };
    assert_eq!(response.status(), StatusCode::SERVICE_UNAVAILABLE);
    assert!(response.headers().contains_key("x-error-id"));
    let body = String::from_utf8(response.into_body().unwrap()).unwrap();
    assert!(body.contains("Checking live-connection access"));
    assert!(body.contains("database connection pool is closed"));
    fixture.close().await;
}

async fn login(fixture: &test_support::Fixture, name: &str) -> String {
    let response = reqwest::Client::new()
        .post(format!("{}/login", fixture.url))
        .header("Origin", &fixture.url)
        .form(&[
            ("username", name),
            ("password", "synthetic-password"),
            ("version", "42"),
            ("createAccount", "true"),
        ])
        .send()
        .await
        .unwrap();
    assert_eq!(response.status(), StatusCode::OK);
    response.headers()[header::SET_COOKIE]
        .to_str()
        .unwrap()
        .split(';')
        .next()
        .unwrap()
        .into()
}

async fn connect(fixture: &test_support::Fixture, cookie: &str) -> Socket {
    connect_query(fixture, cookie, "version=42").await
}

async fn connect_query(fixture: &test_support::Fixture, cookie: &str, query: &str) -> Socket {
    let mut request = format!("ws://{}/ws?{query}", fixture.address)
        .into_client_request()
        .unwrap();
    request
        .headers_mut()
        .insert(header::COOKIE, HeaderValue::from_str(cookie).unwrap());
    request
        .headers_mut()
        .insert(header::ORIGIN, HeaderValue::from_str(&fixture.url).unwrap());
    connect_async(request).await.unwrap().0
}

#[tokio::test]
async fn http_routes_reject_parameters_and_bodies_they_do_not_take_postgres() {
    let Some(fixture) = test_support::Fixture::start().await else {
        return;
    };
    let cookie = login(&fixture, "StrictHttp").await;
    let client = reqwest::Client::new();
    let requests = [
        client.get(format!("{}/test-cookie", fixture.url)).body("x"),
        client.get(format!("{}/test-cookie?utm_source=x", fixture.url)),
        client.get(format!("{}/test-cookie?account=0", fixture.url)),
        client.get(format!("{}/logout?dev=1", fixture.url)),
        client.get(format!("{}/logout?return=%2F", fixture.url)),
        client
            .post(format!("{}/api/v1/identity/token", fixture.url))
            .body("token=x"),
    ];
    for request in requests {
        let response = request
            .header("Origin", &fixture.url)
            .header(header::COOKIE, &cookie)
            .send()
            .await
            .unwrap();
        let url = response.url().clone();
        assert_eq!(response.status(), StatusCode::BAD_REQUEST, "{url}");
        let error: hanabi_protocol::Notice = response.json().await.unwrap();
        assert!(!error.message.is_empty(), "{url}");
    }
    // Errors that the router itself produces take the same form as the URL's other errors.
    let oversized = "a".repeat(9000);
    for (request, status, json) in [
        (
            client.get(format!("{}/api/v1/nope", fixture.url)),
            404,
            true,
        ),
        (client.get(format!("{}/nope", fixture.url)), 404, false),
        (client.get(format!("{}/login", fixture.url)), 405, true),
        (
            client.post(format!("{}/api/v1/variants", fixture.url)),
            405,
            true,
        ),
        (
            client
                .post(format!("{}/api/v1/identity/token", fixture.url))
                .body(oversized.clone()),
            413,
            true,
        ),
    ] {
        let response = request.header("Origin", &fixture.url).send().await.unwrap();
        let url = response.url().clone();
        assert_eq!(response.status().as_u16(), status, "{url}");
        let body = response.text().await.unwrap();
        assert_eq!(
            serde_json::from_str::<hanabi_protocol::Notice>(&body).is_ok(),
            json,
            "{url}: {body}"
        );
    }
}

#[tokio::test]
async fn websocket_rejects_parameters_it_does_not_take_postgres() {
    let Some(fixture) = test_support::Fixture::start().await else {
        return;
    };
    let cookie = login(&fixture, "StrictQuery").await;
    for query in [
        "fastResume=1",
        "reconnect=1",
        "account=x",
        "version=42&version=42",
    ] {
        let mut request = format!("ws://{}/ws?{query}", fixture.address)
            .into_client_request()
            .unwrap();
        request
            .headers_mut()
            .insert(header::COOKIE, HeaderValue::from_str(&cookie).unwrap());
        request
            .headers_mut()
            .insert(header::ORIGIN, HeaderValue::from_str(&fixture.url).unwrap());
        match connect_async(request).await {
            Err(tokio_tungstenite::tungstenite::Error::Http(response)) => {
                assert_eq!(response.status(), StatusCode::BAD_REQUEST, "{query}");
            }
            Err(error) => panic!("{query}: {error}"),
            Ok(_) => panic!("{query}: the connection was accepted"),
        }
    }
}

#[tokio::test]
async fn websocket_checks_client_version_with_existing_cookie_postgres() {
    let Some(fixture) = test_support::Fixture::start().await else {
        return;
    };
    let cookie = login(&fixture, "ClientVersion").await;
    for query in ["", "version=", "version=41"] {
        let mut socket = connect_query(&fixture, &cookie, query).await;
        tokio::time::timeout(Duration::from_secs(5), async {
            let WireMessage::Text(text) = socket.next().await.unwrap().unwrap() else {
                panic!("Expected a version error before any bootstrap messages");
            };
            let body = text.strip_prefix("error ").unwrap();
            let payload: Value = serde_json::from_str(body).unwrap();
            assert_eq!(
                payload["code"],
                hanabi_protocol::NoticeCode::OutdatedClient.name()
            );
            assert!(
                payload["message"]
                    .as_str()
                    .unwrap()
                    .contains("hard-refresh")
            );
            assert!(matches!(
                socket.next().await.unwrap().unwrap(),
                WireMessage::Close(_)
            ));
        })
        .await
        .unwrap();
    }
    let mut socket = connect_query(&fixture, &cookie, "client=app").await;
    receive(&mut socket, "welcome").await;
    socket.close(None).await.unwrap();
    let flagged: Vec<bool> = sqlx::query_scalar!("SELECT is_bot FROM users")
        .fetch_all(&fixture.db.pool)
        .await
        .unwrap();
    assert_eq!(
        flagged,
        [false],
        "an app connection does not flag its account"
    );
    for query in ["version=42", "client=bot"] {
        let mut socket = connect_query(&fixture, &cookie, query).await;
        receive(&mut socket, "welcome").await;
        socket.close(None).await.unwrap();
    }
    let flagged: Vec<bool> = sqlx::query_scalar!("SELECT is_bot FROM users")
        .fetch_all(&fixture.db.pool)
        .await
        .unwrap();
    assert_eq!(flagged, [true], "a bot connection flags its account");
    fixture.close().await;
}

async fn receive(socket: &mut Socket, command: &str) -> Value {
    tokio::time::timeout(Duration::from_secs(10), async {
        loop {
            let next = socket.next().await.unwrap().unwrap();
            let WireMessage::Text(text) = next else {
                continue;
            };
            let (name, body) = text.split_once(' ').unwrap();
            if matches!(name, "warning" | "error") {
                panic!("Unexpected {name} while waiting for {command}: {body}");
            }
            if name == command {
                return serde_json::from_str(body).unwrap();
            }
        }
    })
    .await
    .unwrap_or_else(|_| panic!("Timed out waiting for {command}"))
}

#[tokio::test]
async fn uptime_replies_only_to_requester_in_lobby_and_table_postgres() {
    let Some(fixture) = test_support::Fixture::start().await else {
        return;
    };
    let alice_cookie = login(&fixture, "Alice").await;
    let bob_cookie = login(&fixture, "Bob").await;
    let mut alice = connect(&fixture, &alice_cookie).await;
    let mut bob = connect(&fixture, &bob_cookie).await;
    receive(&mut alice, "welcome").await;
    receive(&mut bob, "welcome").await;
    for socket in [&mut alice, &mut bob] {
        receive(socket, "chatList").await;
        assert_eq!(receive(socket, "lobbyStatus").await["type"], "ready");
    }
    alice
        .send(WireMessage::Text(
            "tableCreate {\"settings\":{\"name\":\"Private uptime\"}}".into(),
        ))
        .await
        .unwrap();
    let table = receive(&mut alice, "tableJoined").await["tableId"]
        .as_u64()
        .unwrap();
    bob.send(WireMessage::Text(
        format!("tableJoin {{\"tableId\":{table}}}").into(),
    ))
    .await
    .unwrap();
    receive(&mut bob, "tableJoined").await;
    alice
        .send(WireMessage::Text("sync {}".into()))
        .await
        .unwrap();
    receive(&mut alice, "synced").await;
    bob.send(WireMessage::Text("sync {}".into())).await.unwrap();
    receive(&mut bob, "synced").await;
    let before: i64 = sqlx::query_scalar!("SELECT COUNT(*) AS \"v!\" FROM chat_log")
        .fetch_one(&fixture.db.pool)
        .await
        .unwrap();
    let tables_before = fixture.app.store.load().await.unwrap();
    for table in [None, Some(table)] {
        let payload = table.map_or_else(
            || json!({"text":"/UpTiMe"}),
            |table| json!({"text":"/UpTiMe","tableId":table}),
        );
        alice
            .send(WireMessage::Text(format!("chat {payload}").into()))
            .await
            .unwrap();
        for prefix in ["The server came online at:", "Uptime:"] {
            let reply = receive(&mut alice, "chat").await;
            assert!(reply.get("username").is_none());
            assert_eq!(reply["recipient"], "Alice");
            assert_eq!(reply.get("tableId").and_then(Value::as_u64), table);
            assert_eq!(reply["source"], "server");
            assert!(reply["text"].as_str().unwrap().starts_with(prefix));
            assert!(reply.get("chatId").is_none());
        }
        bob.send(WireMessage::Text("sync {}".into())).await.unwrap();
        tokio::time::timeout(Duration::from_secs(5), async {
            loop {
                let WireMessage::Text(text) = bob.next().await.unwrap().unwrap() else {
                    continue;
                };
                let (command, _) = text.split_once(' ').unwrap();
                assert_ne!(
                    command, "chat",
                    "Private uptime leaked to another player: {text}"
                );
                if command == "synced" {
                    break;
                }
            }
        })
        .await
        .unwrap();
    }
    assert_eq!(
        sqlx::query_scalar!("SELECT COUNT(*) AS \"v!\" FROM chat_log")
            .fetch_one(&fixture.db.pool)
            .await
            .unwrap(),
        before
    );
    let tables_after = fixture.app.store.load().await.unwrap();
    assert_eq!(
        tables_before
            .iter()
            .map(|(table, _)| (table.id, table.chat.len()))
            .collect::<Vec<_>>(),
        tables_after
            .iter()
            .map(|(table, _)| (table.id, table.chat.len()))
            .collect::<Vec<_>>()
    );
    alice.close(None).await.unwrap();
    bob.close(None).await.unwrap();
    fixture.close().await;
}

#[tokio::test]
async fn http2_login_accepts_uri_authority_without_host_header_postgres() {
    let Some(fixture) = test_support::Fixture::start().await else {
        return;
    };
    let response = router(fixture.app.clone())
        .oneshot(
            Request::builder()
                .method("POST")
                .version(axum::http::Version::HTTP_2)
                .uri(format!("{}/login", fixture.url))
                .header(header::ORIGIN, &fixture.url)
                .header(header::CONTENT_TYPE, "application/x-www-form-urlencoded")
                .extension(ConnectInfo(fixture.address))
                .body(axum::body::Body::from(
                    "username=Http2User&password=synthetic-password&version=42&createAccount=true",
                ))
                .unwrap(),
        )
        .await
        .unwrap();
    assert_eq!(response.status(), StatusCode::OK);
    assert!(response.headers().contains_key(header::SET_COOKIE));
    fixture.close().await;
}

#[tokio::test]
async fn native_browser_login_ws_bootstrap_and_command_routing_postgres() {
    let Some(fixture) = test_support::Fixture::start().await else {
        return;
    };
    // Intentionally use Unicode to verify the username survives login, storage, and WebSocket messages.
    let alice_cookie = login(&fixture, "Alicè").await;
    let bob_cookie = login(&fixture, "Bob").await;
    let alice_id: i32 = sqlx::query_scalar!("SELECT id FROM users WHERE username='Alicè'")
        .fetch_one(&fixture.db.pool)
        .await
        .unwrap();
    let historical:i32=sqlx::query_scalar!("INSERT INTO games(name,num_players,variant_id,timed,time_base,time_per_turn,
         speedrun,deck_plays,empty_clues,one_extra_card,one_less_card,
         all_or_nothing,detrimental_characters,seed,score,num_turns,end_condition,datetime_started,datetime_finished)
         VALUES('Authored history',3,1,true,180,30,false,false,true,false,false,false,true,'p3v1s42',30,40,1,NOW(),NOW()) RETURNING id").fetch_one(&fixture.db.pool).await.unwrap();
    let participant: i32 = sqlx::query_scalar!(
        "INSERT INTO game_participants(game_id,user_id,seat)
         VALUES($1,$2,0) RETURNING id",
        historical,
        alice_id
    )
    .fetch_one(&fixture.db.pool)
    .await
    .unwrap();
    sqlx::query!("INSERT INTO game_participant_notes(game_participant_id,card_order,note) VALUES($1,0,'authored note')", participant).execute(&fixture.db.pool).await.unwrap();
    sqlx::query!(
        "INSERT INTO game_tags(game_id,user_id,tag) VALUES($1,$2,'authored')",
        historical,
        alice_id
    )
    .execute(&fixture.db.pool)
    .await
    .unwrap();
    let mut alice = connect(&fixture, &alice_cookie).await;
    let welcome = receive(&mut alice, "welcome").await;
    assert_eq!(welcome["username"], "Alicè");
    assert!(receive(&mut alice, "chatList").await["messages"].is_array());
    assert_eq!(receive(&mut alice, "lobbyStatus").await["type"], "ready");
    alice
        .send(WireMessage::Text(
            "gameHistory {\"offset\":0,\"amount\":10}".into(),
        ))
        .await
        .unwrap();
    let history = receive(&mut alice, "gameHistory").await;
    assert_eq!(history["games"][0]["gameId"], historical);
    assert_eq!(history["games"][0]["options"]["variantName"], "6 Suits");
    assert_eq!(
        history["games"][0]["options"]["timeControl"]["baseSeconds"],
        180
    );
    assert_eq!(history["games"][0]["options"]["emptyClues"], true);
    assert_eq!(history["games"][0]["tags"], json!(["authored"]));
    let mut bob = connect(&fixture, &bob_cookie).await;
    let bob_welcome = receive(&mut bob, "welcome").await;
    let _ = receive(&mut bob, "user").await;
    receive(&mut bob, "chatList").await;
    assert_eq!(receive(&mut bob, "lobbyStatus").await["type"], "ready");
    alice
        .send(WireMessage::Text(
            "setting {\"settings\":{\"hGroupConventions\":true}}".into(),
        ))
        .await
        .unwrap();
    loop {
        let user = receive(&mut alice, "user").await;
        if user["userId"] == welcome["userId"] && user["hGroupConventions"] == true {
            break;
        }
    }
    alice
        .send(WireMessage::Text(
            r#"chatPm {"text":"private <content>","recipient":"Bob"}"#.into(),
        ))
        .await
        .unwrap();
    let pm = receive(&mut bob, "chat").await;
    assert_eq!(pm["username"], "Alicè");
    assert_eq!(pm["recipient"], "Bob");
    assert_eq!(pm["text"], "private &lt;content&gt;");
    assert!(pm.get("chatId").is_none());
    assert!(pm.get("tableId").is_none());
    let echo = receive(&mut alice, "chat").await;
    assert_eq!(echo, pm);
    alice
        .send(WireMessage::Text("chat {\"text\":\"/token\"}".into()))
        .await
        .unwrap();
    let token = receive(&mut alice, "chat").await;
    assert_eq!(token["recipient"], "Alicè");
    assert!(token["text"].as_str().unwrap().contains("<code>"));
    assert_eq!(
        sqlx::query_scalar!("SELECT COUNT(*) AS \"v!\" FROM chat_log WHERE source='user'")
            .fetch_one(&fixture.db.pool)
            .await
            .unwrap(),
        0
    );
    alice
        .send(WireMessage::Text("chat {\"text\":\"/findvariant\"}".into()))
        .await
        .unwrap();
    let _ = receive(&mut alice, "chat").await;
    assert_eq!(
        receive(&mut alice, "chat").await["text"],
        "You can only perform this command while in a game."
    );
    alice
        .send(WireMessage::Text(
            "tableCreate {\"settings\":{\"name\":\"Browser game\",\"options\":{\"variantName\":\"No Variant\"}}}"
                .into(),
        ))
        .await
        .unwrap();
    let table = receive(&mut alice, "table").await;
    assert!(
        table["tableId"]
            .as_u64()
            .unwrap_or_else(|| table["tableId"].as_u64().unwrap())
            > 0
    );
    let mut replacement = connect(&fixture, &bob_cookie).await;
    receive(&mut replacement, "welcome").await;
    let alice_generation = Session::new(
        UserId(i32::try_from(welcome["userId"].as_i64().unwrap()).unwrap()),
        "Alicè".into(),
        1,
    )
    .0;
    let (reply, received) = oneshot::channel();
    fixture
        .app
        .hub
        .send(HubCommand::LobbyEffects {
            session: alice_generation,
            effects: vec![Publication::ToUser {
                id: UserId(i32::try_from(bob_welcome["userId"].as_i64().unwrap()).unwrap()),
                generation: 2,
                message: Outgoing::new(
                    hanabi_protocol::server::CHAT,
                    hanabi_protocol::Chat::new(
                        "must not reroute to replacement",
                        hanabi_protocol::ChatSource::User,
                        chrono::DateTime::from_timestamp(1_794_009_600, 0).unwrap(),
                    ),
                ),
            }],
            reply,
        })
        .await
        .unwrap();
    received.await.unwrap().unwrap();
    assert!(
        tokio::time::timeout(Duration::from_millis(50), async {
            while let Some(Ok(WireMessage::Text(text))) = replacement.next().await {
                assert!(
                    !text.contains("must not reroute"),
                    "Private reply leaked to replacement session"
                );
            }
        })
        .await
        .is_err()
    );
    // Effects captured for the old recipient generation must never reach replacement.
    let (reply, received) = oneshot::channel();
    fixture
        .app
        .hub
        .send(HubCommand::Directory {
            session: Session::new(UserId(999), "stale".into(), 999).0,
            reply,
        })
        .await
        .unwrap();
    assert!(received.await.unwrap().is_err());
    assert_eq!(bob_welcome["username"], "Bob");
    let cross = reqwest::Client::new()
        .post(format!("{}/login", fixture.url))
        .header("Origin", "https://evil.invalid")
        .form(&[("username", "Nope"), ("password", "x"), ("version", "42")])
        .send()
        .await
        .unwrap();
    assert_eq!(cross.status(), StatusCode::FORBIDDEN);
    let _ = alice.close(None).await;
    let _ = bob.close(None).await;
    let _ = replacement.close(None).await;
    fixture.close().await;
}

#[tokio::test]
async fn native_admission_waits_for_inflight_http_and_fences_lost_ownership_postgres() {
    let Some(fixture) = test_support::Fixture::start().await else {
        return;
    };
    let permit = fixture.app.lifecycle.admit().await.unwrap();
    assert!(
        tokio::time::timeout(Duration::from_millis(20), fixture.app.lifecycle.drain())
            .await
            .is_err()
    );
    drop(permit);
    tokio::time::timeout(Duration::from_secs(1), fixture.app.lifecycle.drain())
        .await
        .unwrap();
    let response = reqwest::Client::new()
        .get(format!("{}/test-cookie", fixture.url))
        .send()
        .await
        .unwrap();
    assert_eq!(response.status(), StatusCode::SERVICE_UNAVAILABLE);
    fixture.close().await;
}

#[tokio::test]
async fn websocket_defers_lobby_reads_without_an_opt_in_postgres() {
    let Some(fixture) = test_support::Fixture::start().await else {
        return;
    };
    let cookie = login(&fixture, "DeferredLobby").await;
    let mut lock = fixture.db.pool.begin().await.unwrap();
    #[expect(
        clippy::disallowed_methods,
        reason = "test SQL that sets up database state or failures directly"
    )]
    sqlx::query("LOCK TABLE games IN ACCESS EXCLUSIVE MODE")
        .execute(&mut *lock)
        .await
        .unwrap();
    let mut socket = connect(&fixture, &cookie).await;
    let welcome = tokio::time::timeout(Duration::from_secs(1), receive(&mut socket, "welcome"))
        .await
        .expect("Archive reads blocked the welcome");
    assert!(welcome.get("totalGames").is_none());
    let loading = receive(&mut socket, "lobbyStatus").await;
    assert_eq!(loading["type"], "loading");
    lock.rollback().await.unwrap();
    let ready = receive(&mut socket, "lobbyStatus").await;
    assert_eq!(ready["type"], "ready");
    assert_eq!(ready["totalGames"], 0);
    socket.close(None).await.unwrap();
    fixture.close().await;
}

async fn test_account(fixture: &test_support::Fixture, id: i32) -> Account {
    Account::read(&fixture.app.store.primary, id)
        .await
        .unwrap()
        .expect("test account")
}

#[tokio::test]
async fn game_archive_locks_do_not_block_authentication_and_deferred_errors_are_explicit() {
    let Some(fixture) = test_support::Fixture::start().await else {
        return;
    };
    let user = fixture.db.user("FastResume").await;
    let mut lock = fixture.db.pool.begin().await.unwrap();
    #[expect(
        clippy::disallowed_methods,
        reason = "test SQL that sets up database state or failures directly"
    )]
    sqlx::query("LOCK TABLE games IN ACCESS EXCLUSIVE MODE")
        .execute(&mut *lock)
        .await
        .unwrap();
    let prepared = tokio::time::timeout(
        Duration::from_secs(1),
        bootstrap(
            &fixture.app,
            test_account(&fixture, user).await,
            "127.0.0.1",
        ),
    )
    .await
    .expect("Archive reads blocked the welcome")
    .unwrap();
    assert_eq!(
        prepared.initial,
        vec![test_frame("lobbyStatus", json!({"type":"loading"}))]
    );
    let slots = fixture
        .app
        .lobby_slots
        .clone()
        .acquire_many_owned(64)
        .await
        .unwrap();
    let (session, mut outgoing) = Session::new(UserId(user), "FastResume".into(), 1);
    load_lobby(fixture.app.clone(), session);
    let message = tokio::time::timeout(Duration::from_secs(1), outgoing.recv())
        .await
        .unwrap()
        .unwrap();
    let body = message
        .message
        .to_text()
        .unwrap()
        .strip_prefix("lobbyStatus ")
        .unwrap();
    let status: Value = serde_json::from_str(body).unwrap();
    assert_eq!(status["type"], "error");
    assert!(status.get("totalGames").is_none());
    assert!(
        status["message"]
            .as_str()
            .unwrap()
            .contains("lobby read queue is full")
    );
    assert!(status["message"].as_str().unwrap().contains("Reference:"));
    drop(slots);
    lock.rollback().await.unwrap();
    fixture.close().await;
}

#[tokio::test]
async fn full_history_bootstrap_queues_in_order_without_a_writer_postgres() {
    let Some(fixture) = test_support::Fixture::start().await else {
        return;
    };
    let alice = fixture.db.user("HistorianAlice").await;
    let mut shared = Vec::new();
    for index in 0..5 {
        shared.push(fixture.db.user(&format!("Historian{index:05}")).await);
    }
    let games:Vec<i32>=sqlx::query_scalar!("INSERT INTO games(name,num_players,variant_id,timed,time_base,time_per_turn,
         speedrun,deck_plays,empty_clues,one_extra_card,one_less_card,
         all_or_nothing,detrimental_characters,seed,score,num_turns,end_condition,datetime_started,datetime_finished)
         SELECT 'Historical game '||n,6,1,true,180,30,false,false,true,false,false,false,true,
         'p6v1s'||n,30,72,1,NOW(),NOW() FROM generate_series(1,200) n ORDER BY n RETURNING id").fetch_all(&fixture.db.pool).await.unwrap();
    let mut players = vec![alice];
    players.extend(&shared);
    sqlx::query!(
        "INSERT INTO game_participants(game_id,user_id,seat)
             SELECT game_id,user_id,(position-1)::smallint FROM unnest($1::int[]) games(game_id)
             CROSS JOIN unnest($2::int[]) WITH ORDINALITY players(user_id,position)",
        &games,
        &players
    )
    .execute(&fixture.db.pool)
    .await
    .unwrap();
    sqlx::query!(
        "INSERT INTO game_tags(game_id,user_id,tag)
         SELECT game_id,$2,lpad(n::text,3,'0')||repeat('t',97)
         FROM unnest($1::int[]) games(game_id) CROSS JOIN generate_series(1,8) n",
        &games,
        alice
    )
    .execute(&fixture.db.pool)
    .await
    .unwrap();
    sqlx::query!(
        "INSERT INTO chat_log(user_id,source,message)
         SELECT $1,'user',$2 FROM generate_series(1,50)",
        alice,
        accounts::escape_html(&"\"".repeat(300))
    )
    .execute(&fixture.db.pool)
    .await
    .unwrap();

    let prepared = bootstrap(
        &fixture.app,
        test_account(&fixture, alice).await,
        "127.0.0.1",
    )
    .await
    .unwrap();
    let mut history_lock = fixture.db.pool.begin().await.unwrap();
    #[expect(
        clippy::disallowed_methods,
        reason = "test SQL that sets up database state or failures directly"
    )]
    sqlx::query("LOCK TABLE game_tags IN ACCESS EXCLUSIVE MODE")
        .execute(&mut *history_lock)
        .await
        .unwrap();
    let (messages, total) = tokio::time::timeout(
        Duration::from_secs(1),
        lobby_initial(&fixture.app, UserId(alice)),
    )
    .await
    .expect("Lobby initialization queried personal history")
    .unwrap();
    assert_eq!(total, 200);
    assert!(
        messages
            .iter()
            .all(|message| !message.starts_with("gameHistory"))
    );
    history_lock.rollback().await.unwrap();
    let own_ids = lobby::history_ids(&fixture.db.pool, UserId(alice), 0, 100)
        .await
        .unwrap();
    let next_ids = lobby::history_ids(&fixture.db.pool, UserId(alice), 100, 100)
        .await
        .unwrap();
    assert_eq!(own_ids.len(), 100);
    assert_eq!(next_ids.len(), 100);
    let own = test_frame(
        "gameHistory",
        json!(
            lobby::get_history(&fixture.db.pool, &own_ids, false)
                .await
                .unwrap()
        ),
    );
    let next = test_frame(
        "gameHistory",
        json!(
            lobby::get_history(&fixture.db.pool, &next_ids, false)
                .await
                .unwrap()
        ),
    );
    let mut initial = lobby_initial(&fixture.app, UserId(alice)).await.unwrap().0;
    assert!(
        initial
            .iter()
            .all(|message| !message.starts_with("gameHistory"))
    );
    // Requested full history pages must still fit in the outbound queue.
    initial.extend([own, next]);
    let mut expected = vec![
        "welcome".to_owned(),
        "userList".to_owned(),
        "tableList".to_owned(),
    ];
    expected.extend(
        initial
            .iter()
            .map(|message| message.split_once(' ').unwrap().0.to_owned()),
    );
    expected.push("user".into());
    assert!(
        initial.iter().all(|message| message.len() < 262_144),
        "This regression must exercise aggregate bootstrap size, not only a large single frame"
    );
    assert!(initial.iter().map(|message| message.len()).sum::<usize>() > 262_144);
    let (session, mut outgoing) = Session::new(UserId(alice), prepared.name, 42);
    let (reply, received) = oneshot::channel();
    fixture
        .app
        .hub
        .send(HubCommand::Register {
            session: session.clone(),
            blocks: BTreeSet::new(),
            welcome: prepared.welcome,
            initial,
            reply,
        })
        .await
        .unwrap();
    tokio::time::timeout(Duration::from_secs(2), received)
        .await
        .unwrap()
        .unwrap()
        .unwrap();
    // No receiver was polled during registration; a writer cannot mask a
    // synchronously overflowing coordinator publication batch.
    assert!(
        session.active(),
        "Full bootstrap exhausted the outbound queue"
    );
    let mut actual = Vec::new();
    while let Ok(outbound) = outgoing.try_recv() {
        let Message::Text(text) = outbound.message else {
            panic!("Unexpected bootstrap frame");
        };
        let (command, body) = text.split_once(' ').unwrap();
        actual.push(command.to_owned());
        let data: Value = serde_json::from_str(body).unwrap();
        match command {
            "chatList" => assert_eq!(data["messages"].as_array().unwrap().len(), 50),
            "gameHistory" => {
                assert_eq!(data.as_array().unwrap().len(), 100);
                assert_eq!(data[0]["playerNames"].as_array().unwrap().len(), 6);
                assert_eq!(data[0]["options"]["variantName"], "6 Suits");
                assert_eq!(data[0]["tags"].as_array().unwrap().len(), 8);
            }
            _ => {}
        }
    }
    assert_eq!(actual, expected);
    assert!(session.active());
    fixture.close().await;
}

#[tokio::test]
async fn a_lobby_command_from_a_replaced_connection_writes_nothing_postgres() {
    let Some(fixture) = test_support::Fixture::start().await else {
        return;
    };
    login(&fixture, "Replaced").await;
    #[expect(
        clippy::disallowed_methods,
        reason = "test SQL that reads the fixture account"
    )]
    let id: i32 = sqlx::query_scalar("SELECT id FROM users WHERE username = 'Replaced'")
        .fetch_one(&fixture.app.store.primary)
        .await
        .unwrap();
    let before = lobby::get_settings(&fixture.app.store.primary, UserId(id))
        .await
        .unwrap()
        .volume;
    // A newer connection registered, but the older one has not noticed yet and is still active.
    let task = fixture.app.users.task(&fixture.app, UserId(id));
    task.send(user::UserCommand::Current(2)).await.unwrap();
    let (older, _frames) = Session::new(UserId(id), "Replaced".into(), 1);
    let volume = before / 2;
    let (reply, replied) = oneshot::channel();
    task.send(user::UserCommand::Lobby {
        session: older,
        message: Box::new(
            crate::actors::client_message("setting", &json!({ "settings": { "volume": volume } }))
                .unwrap(),
        ),
        reply,
    })
    .await
    .unwrap();
    assert!(matches!(
        replied.await.unwrap(),
        Err(CommandError::Rejected { .. })
    ));
    let after = lobby::get_settings(&fixture.app.store.primary, UserId(id))
        .await
        .unwrap()
        .volume;
    assert_eq!(after, before, "A replaced connection changed a setting");
    drop(task);
    fixture.close().await;
}
