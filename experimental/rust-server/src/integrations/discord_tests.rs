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
}

impl Transport for MockTransport {
    fn request(
        &self,
        method: Method,
        path: String,
        body: Option<Value>,
    ) -> BoxFuture<'_, Result<Value>> {
        Box::pin(async move {
            self.requests
                .lock()
                .await
                .push((method.clone(), path.clone(), body));
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
                json!({"id":format!("{}",700000000000000000_u64+self.next.fetch_add(1,Ordering::Relaxed))})
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
async fn discord_mock_transport_public_privacy_rendering_and_status_postgres() {
    let Some(fixture) = Fixture::start().await else {
        return;
    };
    let mock = Arc::new(MockTransport::default());
    let bridge = Bridge::start(fixture.app.clone(), configuration(), Some(mock.clone()))
        .await
        .unwrap();
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
        sqlx::query_scalar::<_, i64>(
            "SELECT COUNT(*) FROM chat_log WHERE source='discord' AND discord_message_id IS NOT NULL"
        )
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
    let stored: String = sqlx::query_scalar(
        "SELECT message FROM chat_log WHERE discord_message_id='111111111111111113'",
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
        sqlx::query_scalar::<_, i64>(
            "SELECT COUNT(*) FROM chat_log WHERE discord_message_id='111111111111111113'"
        )
        .fetch_one(&fixture.db.pool)
        .await
        .unwrap(),
        1
    );
    let alice = fixture.db.user("Alice").await;
    let raw = "public <text>";
    let id:i32=sqlx::query_scalar("INSERT INTO chat_log(user_id,source,message,room) VALUES($1,'user',$2,'lobby') RETURNING id")
        .bind(alice).bind(escape_html(raw)).fetch_one(&fixture.db.pool).await.unwrap();
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
