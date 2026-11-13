use super::discord::*;
use crate::web::test_support::Fixture;
use axum::{
    body::Bytes,
    extract::State,
    http::{Method, StatusCode, Uri},
    response::{IntoResponse, Response},
};
use serde_json::{Value, json};
use std::{
    collections::HashMap,
    sync::{
        Arc,
        atomic::{AtomicU64, Ordering},
    },
    time::Duration,
};
use tokio::sync::Mutex;
use twilight_gateway::Event;
use twilight_model::{
    channel::{ChannelType, Message},
    gateway::payload::incoming::MessageCreate,
};

/// A Discord HTTP API that records each request and answers with synthetic data.
#[derive(Default)]
struct MockDiscord {
    /// Each request's method, path below the API version, and JSON body.
    requests: Mutex<Vec<(Method, String, Option<Value>)>>,
    next: AtomicU64,
    restart_delay: Duration,
    restart_barrier: Option<Arc<tokio::sync::Barrier>>,
    failed_restart_channel: Option<&'static str>,
}

const BOT: &str = "999999999999999999";

fn user(id: &str, name: &str) -> Value {
    json!({"id":id,"username":name,"discriminator":"0","avatar":null})
}

fn message(id: &str, channel: &str, author: &str, content: &str) -> Value {
    json!({
        "id":id,"channel_id":channel,"guild_id":"444444444444444444","author":user(author,"Author"),
        "content":content,"timestamp":"2026-01-01T00:00:00.000000+00:00","edited_timestamp":null,
        "tts":false,"mention_everyone":false,"mentions":[],"mention_roles":[],"attachments":[],
        "embeds":[],"pinned":false,"type":0
    })
}

/// A message that a Discord user posted in the lobby channel.
fn posted(id: &str, content: &str) -> Event {
    let message: Message = serde_json::from_value(message(
        id,
        "555555555555555555",
        "888888888888888888",
        content,
    ))
    .unwrap();
    Event::MessageCreate(Box::new(MessageCreate {
        channel_type: Some(ChannelType::GuildText),
        message,
    }))
}

async fn answer(
    State(mock): State<Arc<MockDiscord>>,
    method: Method,
    uri: Uri,
    body: Bytes,
) -> Response {
    let path = uri
        .path()
        .strip_prefix("/api/v10")
        .unwrap_or(uri.path())
        .to_owned();
    let body: Option<Value> = serde_json::from_slice(&body).ok();
    let restart = method == Method::POST
        && body
            .as_ref()
            .and_then(|body| body["content"].as_str())
            .is_some_and(|text| {
                text.starts_with("The server went down for a restart at:")
                    || text.starts_with("The server is stopping gracefully at:")
            });
    mock.requests
        .lock()
        .await
        .push((method.clone(), path.clone(), body));
    if restart {
        if let Some(barrier) = &mock.restart_barrier {
            barrier.wait().await;
        }
        tokio::time::sleep(mock.restart_delay).await;
        if mock
            .failed_restart_channel
            .is_some_and(|channel| path == format!("/channels/{channel}/messages"))
        {
            return StatusCode::INTERNAL_SERVER_ERROR.into_response();
        }
    }
    let data = if path == "/users/@me" {
        json!({"id":BOT,"username":"bot","discriminator":"0","avatar":null,"bot":true,"mfa_enabled":false})
    } else if path.ends_with("/roles") {
        let role = |id: &str, name: &str| {
            json!({"id":id,"name":name,"color":0,"hoist":false,"managed":false,"mentionable":true,
                   "permissions":"0","position":1,"flags":0,
                   "colors":{"primary_color":0,"secondary_color":null,"tertiary_color":null}})
        };
        json!([
            role("111111111111111111", "Ping Crew"),
            role("222222222222222222", "Trusted Teacher")
        ])
    } else if path.contains("/roles/") {
        return StatusCode::NO_CONTENT.into_response();
    } else if path.contains("/members/") {
        json!({"nick":"Nick <@333333333333333333>","user":user("888888888888888888","Nick"),
               "roles":[],"joined_at":null,"deaf":false,"mute":false,"flags":0})
    } else if method == Method::POST {
        let id = format!(
            "{}",
            700_000_000_000_000_000_u64 + mock.next.fetch_add(1, Ordering::Relaxed)
        );
        let channel = path.split('/').nth(2).unwrap_or_default();
        message(&id, channel, BOT, "")
    } else {
        let channel = path.split('/').nth(2).unwrap_or_default();
        json!({"id":channel,"guild_id":"444444444444444444","type":0,"name":"general"})
    };
    axum::Json(data).into_response()
}

impl MockDiscord {
    /// Serves this mock, and returns an HTTP client for Discord that sends its requests to it.
    async fn serve(self: &Arc<Self>) -> twilight_http::Client {
        let listener = tokio::net::TcpListener::bind("127.0.0.1:0").await.unwrap();
        let address = listener.local_addr().unwrap();
        let router = axum::Router::new()
            .fallback(answer)
            .with_state(self.clone());
        tokio::spawn(async move { axum::serve(listener, router).await });
        twilight_http::Client::builder()
            .token("synthetic-never-networked".into())
            .proxy(address.to_string(), true)
            .ratelimiter(None)
            .build()
    }
}

#[tokio::test]
async fn lifecycle_announcements_reach_both_channels_despite_network_latency_postgres() {
    let Some(fixture) = Fixture::start().await else {
        return;
    };
    let mock = Arc::new(MockDiscord {
        restart_delay: Duration::from_millis(350),
        restart_barrier: Some(Arc::new(tokio::sync::Barrier::new(2))),
        ..MockDiscord::default()
    });
    let bridge = Bridge::start(
        fixture.app.integration_server(),
        configuration(),
        Some(mock.serve().await),
    )
    .await
    .unwrap();
    bridge.event(Event::Resumed).await.unwrap();
    let integrations = super::Integrations {
        discord: Some(bridge.clone()),
        discord_failed: false,
        alerts: super::alerts::Alerts::start(
            None,
            true,
            "test".into(),
            &fixture.app.background,
            fixture.app.lifecycle.shutdown().clone(),
        ),
    };
    tokio::time::timeout(Duration::from_secs(2), async {
        integrations
            .announce_restart(Duration::from_mins(78), Some("Deploying"))
            .await;
        integrations
            .announce_stop(Duration::from_mins(78), None)
            .await;
    })
    .await
    .unwrap();
    assert_eq!(
        mock.next.load(Ordering::Relaxed),
        6,
        "All lifecycle notices must finish delivery to both channels"
    );
    assert_eq!(bridge.status(), "ready");
    let requests = mock.requests.lock().await;
    let messages = |channel: &str| {
        requests
            .iter()
            .filter_map(|(method, path, body)| {
                if *method == Method::POST && path == &format!("/channels/{channel}/messages") {
                    body.as_ref().and_then(|body| body["content"].as_str())
                } else {
                    None
                }
            })
            .collect::<Vec<_>>()
    };
    assert_eq!(
        messages("555555555555555555"),
        messages("666666666666666666")
    );
    drop(requests);
    fixture.close().await;
}

#[tokio::test]
async fn failed_restart_channel_does_not_cancel_other_delivery_postgres() {
    for channel in ["555555555555555555", "666666666666666666"] {
        let Some(fixture) = Fixture::start().await else {
            return;
        };
        let mock = Arc::new(MockDiscord {
            failed_restart_channel: Some(channel),
            restart_barrier: Some(Arc::new(tokio::sync::Barrier::new(2))),
            ..MockDiscord::default()
        });
        let bridge = Bridge::start(
            fixture.app.integration_server(),
            configuration(),
            Some(mock.serve().await),
        )
        .await
        .unwrap();
        bridge.event(Event::Resumed).await.unwrap();
        let result = tokio::time::timeout(
            Duration::from_secs(2),
            bridge.announce_restart(Duration::from_mins(78), Some("Deploying")),
        )
        .await
        .unwrap();
        assert!(result.is_err());
        assert_eq!(
            mock.next.load(Ordering::Relaxed),
            3,
            "The other channel must still finish delivery"
        );
        fixture.close().await;
    }
}

fn configuration() -> Configuration {
    Configuration::read(&HashMap::from([
        ("DISCORD_TOKEN".into(), "synthetic-never-networked".into()),
        ("DISCORD_GUILD_ID".into(), "444444444444444444".into()),
        (
            "DISCORD_CHANNEL_SYNC_WITH_LOBBY".into(),
            "555555555555555555".into(),
        ),
        (
            "DISCORD_CHANNEL_WEBSITE_DEVELOPMENT".into(),
            "666666666666666666".into(),
        ),
        ("DISCORD_PING_CREW_ROLE_NAME".into(), "Ping Crew".into()),
        (
            "DISCORD_TRUSTED_TEACHER_ROLE_NAME".into(),
            "Trusted Teacher".into(),
        ),
    ]))
    .unwrap()
    .unwrap()
}

#[tokio::test]
async fn discord_lifecycle_announcements_match_across_channels_postgres() {
    let Some(fixture) = Fixture::start().await else {
        return;
    };
    let mock = Arc::new(MockDiscord::default());
    let bridge = Bridge::start(
        fixture.app.integration_server(),
        configuration(),
        Some(mock.serve().await),
    )
    .await
    .unwrap();
    bridge.event(Event::Resumed).await.unwrap();
    bridge.event(Event::Resumed).await.unwrap();
    fixture.app.lifecycle.stop_admitting();
    let (reply, quiesced) = tokio::sync::oneshot::channel();
    fixture
        .app
        .hub
        .send(crate::actors::HubCommand::Quiesce(reply))
        .await
        .unwrap();
    assert!(quiesced.await.unwrap().is_empty());
    bridge
        .announce_restart(Duration::from_mins(78), None)
        .await
        .unwrap();
    bridge
        .announce_stop(
            Duration::from_mins(78),
            Some("Upgrading <the> database & 'more'"),
        )
        .await
        .unwrap();
    let requests = mock.requests.lock().await;
    let posted = |channel: &str| -> Vec<String> {
        requests
            .iter()
            .filter_map(|(method, path, body)| {
                if *method == Method::POST && path == &format!("/channels/{channel}/messages") {
                    body.as_ref()
                        .and_then(|body| body["content"].as_str())
                        .map(str::to_owned)
                } else {
                    None
                }
            })
            .collect()
    };
    let lobby = posted("555555555555555555");
    let development = posted("666666666666666666");
    // A restart without a reason is announced only in the development channel.
    assert_eq!(lobby.len(), 2, "{lobby:?}");
    assert_eq!(development.len(), 3, "{development:?}");
    assert_eq!(lobby[0], development[0]);
    assert_eq!(lobby[1], development[2]);
    assert!(development[0].starts_with("The server has successfully started at: "));
    assert!(development[0].ends_with(&format!("({})", crate::restart::version())));
    assert!(!development[0].contains("(v42)"));
    assert!(development[1].starts_with("The server went down for a restart at: "));
    assert!(development[1].ends_with(&format!(
        "({}) - Uptime: 1 hour and 18 minutes",
        crate::restart::version()
    )));
    assert!(development[2].starts_with("The server is stopping gracefully at: "));
    assert!(
        development[2].ends_with(&format!(
            "({}) - Uptime: 1 hour and 18 minutes Reason: Upgrading <the> database & 'more'",
            crate::restart::version()
        )),
        "{}",
        development[2]
    );
    drop(requests);
    let messages: Vec<String> =
        sqlx::query_scalar!("SELECT message FROM chat_log WHERE source='server' ORDER BY id")
            .fetch_all(&fixture.db.pool)
            .await
            .unwrap();
    assert_eq!(
        messages.len(),
        2,
        "Lobby lifecycle notices must also remain in lobby history"
    );
    assert!(messages[1].ends_with("Reason: Upgrading <the> database & 'more'"));
    sqlx::query!(
        "UPDATE chat_log SET datetime_sent=datetime_sent-INTERVAL '150 seconds'
         WHERE source='server'"
    )
    .execute(&fixture.db.pool)
    .await
    .unwrap();
    let replacement = Bridge::start(
        fixture.app.integration_server(),
        configuration(),
        Some(mock.serve().await),
    )
    .await
    .unwrap();
    replacement.event(Event::Resumed).await.unwrap();
    let started: String = sqlx::query_scalar!(
        "SELECT message FROM chat_log WHERE source='server' ORDER BY id DESC LIMIT 1"
    )
    .fetch_one(&fixture.db.pool)
    .await
    .unwrap();
    assert!(started.starts_with("The server has successfully started at: "));
    assert!(started.ends_with(&format!(
        "({}) - Downtime: 3 minutes",
        crate::restart::version()
    )));
    // After a restart without a reason, the startup is announced only in the development
    // channel, and the downtime comes from the previous process.
    let mut server = fixture.app.integration_server();
    server.info = Arc::new(crate::server_info::ServerInfo::new(
        false,
        "localhost",
        Some(chrono::Utc::now() - chrono::Duration::seconds(150)),
    ));
    let quiet_mock = Arc::new(MockDiscord::default());
    let quiet = Bridge::start(server, configuration(), Some(quiet_mock.serve().await))
        .await
        .unwrap();
    quiet.event(Event::Resumed).await.unwrap();
    let requests = quiet_mock.requests.lock().await;
    let posted: Vec<_> = requests
        .iter()
        .filter(|(method, _, _)| *method == Method::POST)
        .map(|(_, path, body)| (path.clone(), body.as_ref().unwrap()["content"].clone()))
        .collect();
    assert_eq!(posted.len(), 1, "{posted:?}");
    assert_eq!(posted[0].0, "/channels/666666666666666666/messages");
    assert!(posted[0].1.as_str().unwrap().ends_with(&format!(
        "({}) - Downtime: 3 minutes",
        crate::restart::version()
    )));
    drop(requests);
    let latest: String = sqlx::query_scalar!(
        "SELECT message FROM chat_log WHERE source='server' ORDER BY id DESC LIMIT 1"
    )
    .fetch_one(&fixture.db.pool)
    .await
    .unwrap();
    assert_eq!(latest, started);
    fixture.close().await;
}

#[tokio::test]
async fn discord_mock_transport_public_privacy_rendering_and_status_postgres() {
    let Some(fixture) = Fixture::start().await else {
        return;
    };
    let mock = Arc::new(MockDiscord::default());
    let bridge = Bridge::start(
        fixture.app.integration_server(),
        configuration(),
        Some(mock.serve().await),
    )
    .await
    .unwrap();
    // The bridge handles the gateway's events as they arrive.
    let (gateway, events) = tokio::sync::mpsc::channel(1);
    bridge.handle(
        events,
        super::alerts::Alerts::start(
            None,
            true,
            "test".into(),
            &fixture.app.background,
            fixture.app.lifecycle.shutdown().clone(),
        ),
    );
    gateway.send(Event::Resumed).await.unwrap();
    tokio::time::timeout(Duration::from_secs(2), async {
        while bridge.status() != "ready" {
            tokio::time::sleep(Duration::from_millis(5)).await;
        }
    })
    .await
    .unwrap();
    for (id, text) in [
        ("111111111111111110", "/token"),
        ("111111111111111112", "/unknown secret"),
    ] {
        bridge.event(posted(id, text)).await.unwrap();
    }
    assert_eq!(
        sqlx::query_scalar!("SELECT COUNT(*) AS \"v!\" FROM chat_log WHERE source='discord' AND discord_message_id IS NOT NULL")
        .fetch_one(&fixture.db.pool)
        .await
        .unwrap(),
        0
    );
    bridge
        .event(posted(
            "111111111111111113",
            "hello <@888888888888888888> ||hidden||",
        ))
        .await
        .unwrap();
    let stored: String = sqlx::query_scalar!(
        "SELECT message FROM chat_log WHERE discord_message_id='111111111111111113'"
    )
    .fetch_one(&fixture.db.pool)
    .await
    .unwrap();
    assert_eq!(stored, "hello @Nick <@333333333333333333> ||hidden||");
    assert!(
        !mock
            .requests
            .lock()
            .await
            .iter()
            .any(|(_, path, _)| path.ends_with("/members/333333333333333333"))
    );
    bridge
        .event(posted("111111111111111113", "duplicate"))
        .await
        .unwrap();
    assert_eq!(
        sqlx::query_scalar!(
            "SELECT COUNT(*) AS \"v!\" FROM chat_log WHERE discord_message_id='111111111111111113'"
        )
        .fetch_one(&fixture.db.pool)
        .await
        .unwrap(),
        1
    );
    let alice = fixture.db.user("Alice").await;
    let raw = "public <text>";
    let id: i32 = sqlx::query_scalar!(
        "INSERT INTO chat_log(user_id,source,message) VALUES($1,'user',$2) RETURNING id",
        alice,
        raw
    )
    .fetch_one(&fixture.db.pool)
    .await
    .unwrap();
    assert!(bridge.mirror(id, Some("private secret")).await.is_err());
    bridge.mirror(id, Some(raw)).await.unwrap();
    let requests = mock.requests.lock().await;
    let outbound: Vec<_> = requests
        .iter()
        .filter(|(method, path, body)| {
            *method == Method::POST
                && path.ends_with("/messages")
                && body
                    .as_ref()
                    .is_some_and(|body| body["content"] == "<**Alice**> public <text>")
        })
        .collect();
    assert_eq!(outbound.len(), 1);
    assert_eq!(
        outbound[0].2.as_ref().unwrap()["content"],
        "<**Alice**> public <text>"
    );
    assert_eq!(
        outbound[0].2.as_ref().unwrap()["allowed_mentions"]["parse"],
        json!([])
    );
    drop(requests);
    bridge.event(Event::GatewayClose(None)).await.unwrap();
    assert_eq!(bridge.status(), "degraded");
    bridge.event(Event::Resumed).await.unwrap();
    assert_eq!(bridge.status(), "ready");
    fixture.close().await;
    assert_eq!(bridge.status(), "closed");
}
