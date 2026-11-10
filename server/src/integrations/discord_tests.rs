use super::discord::*;
use crate::{accounts::escape_html, web::test_support::Fixture};
use anyhow::Result;
use futures_util::future::BoxFuture;
use reqwest::Method;
use serde_json::{Value, json};
use std::{
    collections::HashMap,
    sync::{
        Arc,
        atomic::{AtomicU64, Ordering},
    },
    time::Duration,
};
use tokio::sync::{Mutex, mpsc};
use tokio_util::sync::CancellationToken;

#[derive(Default)]
struct MockTransport {
    requests: Mutex<Vec<(Method, String, Option<Value>)>>,
    next: AtomicU64,
    restart_delay: Duration,
    restart_barrier: Option<Arc<tokio::sync::Barrier>>,
    failed_restart_channel: Option<&'static str>,
}

impl Transport for MockTransport {
    fn request(
        &self,
        method: Method,
        path: String,
        body: Option<Value>,
    ) -> BoxFuture<'_, Result<Value>> {
        Box::pin(async move {
            let restart = method == Method::POST
                && body
                    .as_ref()
                    .and_then(|body| body["content"].as_str())
                    .is_some_and(|text| {
                        text.starts_with("The server went down for a restart at:")
                            || text.starts_with("The server is stopping gracefully at:")
                    });
            self.requests
                .lock()
                .await
                .push((method.clone(), path.clone(), body));
            if restart {
                if let Some(barrier) = &self.restart_barrier {
                    barrier.wait().await;
                }
                tokio::time::sleep(self.restart_delay).await;
                anyhow::ensure!(
                    self.failed_restart_channel
                        .is_none_or(|channel| path != format!("/channels/{channel}/messages")),
                    "Synthetic channel delivery failure"
                );
            }
            Ok(if path == "/users/@me" {
                json!({"id":"999999999999999999"})
            } else if path.ends_with("/roles") {
                json!([
                    {"id":"111111111111111111","name":"Ping Crew"},
                    {"id":"222222222222222222","name":"Trusted Teacher"}
                ])
            } else if path.contains("/members/") {
                json!({"nick":"Nick <@333333333333333333>","user":{"username":"Nick"}})
            } else if method == Method::POST {
                json!({"id":format!("{}",700_000_000_000_000_000_u64+self.next.fetch_add(1,Ordering::Relaxed))})
            } else {
                json!({"guild_id":"444444444444444444","type":0,"name":"general"})
            })
        })
    }

    fn gateway(
        &self,
        events: mpsc::Sender<Value>,
        cancel: CancellationToken,
    ) -> BoxFuture<'_, Result<()>> {
        Box::pin(async move {
            events.send(json!({"t":"READY"})).await?;
            cancel.cancelled().await;
            Ok(())
        })
    }
}

#[tokio::test]
async fn lifecycle_announcements_reach_both_channels_despite_network_latency_postgres() {
    let Some(fixture) = Fixture::start().await else {
        return;
    };
    let mock = Arc::new(MockTransport {
        restart_delay: Duration::from_millis(350),
        restart_barrier: Some(Arc::new(tokio::sync::Barrier::new(2))),
        ..MockTransport::default()
    });
    let bridge = Bridge::start(
        fixture.app.integration_server(),
        configuration(),
        Some(mock.clone()),
    )
    .await
    .unwrap();
    bridge.event(json!({"t":"READY"})).await.unwrap();
    let integrations = super::Integrations {
        discord: Some(bridge.clone()),
        discord_failed: false,
        alerts: super::alerts::Alerts::start(
            None,
            true,
            "test".into(),
            &fixture.app.background,
            fixture.app.lifecycle.shutdown.clone(),
        ),
    };
    tokio::time::timeout(Duration::from_secs(2), async {
        integrations
            .announce_restart(Duration::from_mins(78), None)
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
        let mock = Arc::new(MockTransport {
            failed_restart_channel: Some(channel),
            restart_barrier: Some(Arc::new(tokio::sync::Barrier::new(2))),
            ..MockTransport::default()
        });
        let bridge = Bridge::start(
            fixture.app.integration_server(),
            configuration(),
            Some(mock.clone()),
        )
        .await
        .unwrap();
        bridge.event(json!({"t":"READY"})).await.unwrap();
        let result = tokio::time::timeout(
            Duration::from_secs(2),
            bridge.announce_restart(Duration::from_mins(78), None),
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
    let mock = Arc::new(MockTransport::default());
    let bridge = Bridge::start(
        fixture.app.integration_server(),
        configuration(),
        Some(mock.clone()),
    )
    .await
    .unwrap();
    bridge.event(json!({"t":"READY"})).await.unwrap();
    bridge.event(json!({"t":"RESUMED"})).await.unwrap();
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
    for channel in ["555555555555555555", "666666666666666666"] {
        let messages: Vec<_> = requests
            .iter()
            .filter_map(|(method, path, body)| {
                if *method == Method::POST && path == &format!("/channels/{channel}/messages") {
                    body.as_ref().and_then(|body| body["content"].as_str())
                } else {
                    None
                }
            })
            .collect();
        assert_eq!(
            messages.len(),
            3,
            "Lifecycle messages must be sent once per channel"
        );
        assert!(messages[0].starts_with("The server has successfully started at: "));
        assert!(messages[0].ends_with(&format!("({})", crate::restart::version())));
        assert!(!messages[0].contains("(v42)"));
        assert!(messages[1].starts_with("The server went down for a restart at: "));
        assert!(messages[1].ends_with(&format!(
            "({}) - Uptime: 1 hour and 18 minutes",
            crate::restart::version()
        )));
        assert!(messages[2].starts_with("The server is stopping gracefully at: "));
        assert!(
            messages[2].ends_with(&format!(
                "({}) - Uptime: 1 hour and 18 minutes Reason: Upgrading <the> database & 'more'",
                crate::restart::version()
            )),
            "{channel}: {}",
            messages[2]
        );
    }
    drop(requests);
    let messages: Vec<String> =
        sqlx::query_scalar!("SELECT message FROM chat_log WHERE source='server' ORDER BY id")
            .fetch_all(&fixture.db.pool)
            .await
            .unwrap();
    assert_eq!(
        messages.len(),
        3,
        "All lifecycle notices must also remain in lobby history"
    );
    assert!(messages[1].contains("Uptime: 1 hour and 18 minutes"));
    // Lobby chat is HTML, so the administrator's reason is stored escaped.
    assert!(messages[2].ends_with("Reason: Upgrading &lt;the&gt; database &amp; &#39;more&#39;"));
    sqlx::query!(
        "UPDATE chat_log SET datetime_sent=NOW()-INTERVAL '150 seconds'
         WHERE id=(SELECT MAX(id) FROM chat_log WHERE source='server')"
    )
    .execute(&fixture.db.pool)
    .await
    .unwrap();
    let replacement = Bridge::start(
        fixture.app.integration_server(),
        configuration(),
        Some(mock.clone()),
    )
    .await
    .unwrap();
    replacement.event(json!({"t":"READY"})).await.unwrap();
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
    fixture.close().await;
}

#[tokio::test]
async fn discord_mock_transport_public_privacy_rendering_and_status_postgres() {
    let Some(fixture) = Fixture::start().await else {
        return;
    };
    let mock = Arc::new(MockTransport::default());
    let bridge = Bridge::start(
        fixture.app.integration_server(),
        configuration(),
        Some(mock.clone()),
    )
    .await
    .unwrap();
    // The mock gateway sends READY once the bridge listens.
    bridge.listen(super::alerts::Alerts::start(
        None,
        true,
        "test".into(),
        &fixture.app.background,
        fixture.app.lifecycle.shutdown.clone(),
    ));
    tokio::time::timeout(Duration::from_secs(2), async {
        while bridge.status() != "ready" {
            tokio::time::sleep(Duration::from_millis(5)).await;
        }
    })
    .await
    .unwrap();
    let event = |id: &str, content: &str| {
        json!({
            "t":"MESSAGE_CREATE","d":{"id":id,"guild_id":"444444444444444444",
            "channel_id":"555555555555555555","author":{"id":"888888888888888888"},"content":content}
        })
    };
    for (id, text) in [
        ("111111111111111110", "/token"),
        ("111111111111111112", "/unknown secret"),
    ] {
        bridge.event(event(id, text)).await.unwrap();
    }
    assert_eq!(
        sqlx::query_scalar!("SELECT COUNT(*) AS \"v!\" FROM chat_log WHERE source='discord' AND discord_message_id IS NOT NULL")
        .fetch_one(&fixture.db.pool)
        .await
        .unwrap(),
        0
    );
    bridge
        .event(event(
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
    assert_eq!(
        stored,
        "hello @Nick &lt;@333333333333333333&gt; <span class=\"spoiler\">hidden</span>"
    );
    assert!(
        !mock
            .requests
            .lock()
            .await
            .iter()
            .any(|(_, path, _)| path.ends_with("/members/333333333333333333"))
    );
    bridge
        .event(event("111111111111111113", "duplicate"))
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
    let id:i32=sqlx::query_scalar!("INSERT INTO chat_log(user_id,source,message,room) VALUES($1,'user',$2,'lobby') RETURNING id", alice, escape_html(raw)).fetch_one(&fixture.db.pool).await.unwrap();
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
    bridge
        .event(json!({"t":"TRANSPORT_DISCONNECTED"}))
        .await
        .unwrap();
    assert_eq!(bridge.status(), "degraded");
    bridge.event(json!({"t":"RESUMED"})).await.unwrap();
    assert_eq!(bridge.status(), "ready");
    fixture.close().await;
    assert_eq!(bridge.status(), "closed");
}
