use super::*;
use crate::{
    state::{RedisState, StateId},
    test_redis::RedisFixture,
};
use sqlx::postgres::PgPoolOptions;

#[test]
fn typed_game_frames_preserve_wire_schema_and_projected_identities() -> Result<()> {
    let mut game = Game::new(crate::game::standard_deck("p2v0s1")?)?;
    let rank = game.deck[game.players[1].hand[0]].rank;
    game.apply(
        0,
        Action {
            kind: 3,
            target: 1,
            value: rank,
        },
    )?;
    game.terminate(
        0,
        EndCondition::TerminatedByPlayer,
        0,
        None,
        Some(CompletionTiming {
            player_times: vec![1234, -5678],
            duration: 6912,
        }),
    )?;
    for (recipient, hidden) in [
        (Recipient::Player { player_index: 0 }, Some(0)),
        (Recipient::Player { player_index: 1 }, Some(1)),
        (
            Recipient::Spectator {
                shadowing_player_index: Some(0),
            },
            Some(0),
        ),
        (
            Recipient::Spectator {
                shadowing_player_index: None,
            },
            None,
        ),
    ] {
        let list = hanabi_engine::events_for_recipient(&game.0, recipient, None)?;
        let encoded = frame(
            "gameActionList",
            GameActionListMessage {
                table_id: 42,
                list: &list,
            },
        );
        let (command, body) = encoded
            .split_once(' ')
            .context("Missing protocol separator")?;
        assert_eq!(command, "gameActionList");
        let body: Value = serde_json::from_str(body)?;
        assert_eq!(body, json!({"tableID":42,"list":list}));
        for (event, expected) in list.iter().zip(body["list"].as_array().unwrap()) {
            let encoded = frame(
                "gameAction",
                GameActionMessage {
                    table_id: 42,
                    action: event,
                },
            );
            let (command, body) = encoded
                .split_once(' ')
                .context("Missing action separator")?;
            assert_eq!(command, "gameAction");
            let body: Value = serde_json::from_str(body)?;
            assert_eq!(body, json!({"tableID":42,"action":expected}));
            if expected["type"] == "draw" {
                let player = expected["playerIndex"].as_u64().unwrap() as usize;
                let order = expected["order"].as_u64().unwrap() as usize;
                let (suit, rank) = if hidden == Some(player) {
                    (-1, -1)
                } else {
                    (game.deck[order].suit_index as i32, game.deck[order].rank)
                };
                assert_eq!(expected["suitIndex"], suit);
                assert_eq!(expected["rank"], rank);
            }
        }
        let events = body["list"].as_array().unwrap();
        let ended = events.iter().find(|e| e["type"] == "gameOver").unwrap();
        assert_eq!(ended["endCondition"], 4);
        assert!(ended.as_object().unwrap().get("votes").unwrap().is_null());
        let timing = events.iter().find(|e| e["type"] == "playerTimes").unwrap();
        assert_eq!(timing["playerTimes"], json!([1234, -5678]));
        assert_eq!(timing["duration"], 6912);
    }
    Ok(())
}

#[test]
fn countdown_preserves_go_float_syntax_and_rejects_nonfinite_values() {
    for (text, expected) in [
        (".5", 0.5),
        ("1_0", 10.0),
        ("x1p0", 1.0),
        ("x1.8p1", 3.0),
        ("x1p-99999", 0.0),
    ] {
        assert_eq!(parse_start_minutes(text), Some(expected), "{text}");
    }
    for text in ["-1", "+1", "NaN", "Infinity", "1e9999", "x1p99999"] {
        assert!(parse_start_minutes(text).is_none(), "{text}");
    }
}
async fn fixture_store(namespace: &str) -> Result<(RedisFixture, Store, RedisState)> {
    let fixture = RedisFixture::start(true).await?;
    let state = RedisState::connect(&fixture.url, namespace).await?;
    let pool = PgPoolOptions::new().connect_lazy("postgres://unused@127.0.0.1/unused")?;
    Ok((fixture, Store::fixture(pool, state.clone()), state))
}
pub(super) fn pregame(id: u64) -> TableSnapshot {
    TableSnapshot {
        format: FORMAT.into(),
        id,
        name: "reservation".into(),
        owner: 1,
        visible: true,
        options: Options::default(),
        max_players: 6,
        password_hash: None,
        extra: ExtraOptions::default(),
        created: Utc::now(),
        phase: Phase::Pregame {
            players: vec![Player {
                id: 1,
                name: "Alice".into(),
                stats: crate::store::zero_stats(),
            }],
            automatic_start: None,
            countdown: None,
            kicked: vec![],
        },
        chat: vec![],
        chat_archived: 0,
        receipts: vec![],
        shadows: BTreeMap::new(),
        pending_spawn: None,
        retire_after_spawn: false,
        pending_tag: None,
    }
}

fn attendance(session: Arc<Session>, spectator: bool) -> Attendance {
    Attendance {
        session,
        spectator,
        loaded: false,
        shadow: None,
        chat_read: 0,
        typing_until: None,
    }
}

#[tokio::test]
async fn abandoned_pregames_expire_durably_even_with_a_password_or_spectator() -> Result<()> {
    let (_redis, store, state) = fixture_store("abandoned-pregames").await?;
    for protected in [false, true] {
        let id = store.allocate_table().await?;
        let mut table = pregame(id);
        table.password_hash = protected.then(|| "unused-test-password-hash".into());
        let revision = store.save(&table, 0).await?;
        let capacity = Arc::new(Semaphore::new(1));
        let (hub, mut notifications) = mpsc::channel(32);
        let mut actor = TableActor::new(
            table,
            revision,
            store.clone(),
            hub,
            capacity.clone().try_acquire_owned()?,
        );
        let (owner, _owner_frames) = Session::new(1, "Alice".into(), 1, false);
        let (observer, _observer_frames) = Session::new(2, "Observer".into(), 1, false);
        actor.attendees.insert(1, attendance(owner.clone(), false));
        actor.attendees.insert(2, attendance(observer, true));
        let now = Instant::now();
        actor.cleanup(now).await?;
        owner.cancel.cancel();
        actor.cleanup(now).await?;
        actor
            .cleanup(now + PREGAME_RECONNECT_GRACE - Duration::from_millis(1))
            .await?;
        ensure!(
            !actor.retired && state.get(StateId::Table(id)).await?.is_some(),
            "Disconnected player lost the reconnect grace period"
        );
        actor.cleanup(now + PREGAME_RECONNECT_GRACE).await?;
        ensure!(actor.retired, "Abandoned pregame did not retire");
        ensure!(
            state.load().await?.is_empty(),
            "Abandoned pregame remained in durable storage"
        );
        let mut removed = false;
        let mut observer_booted = false;
        while let Ok(notification) = notifications.try_recv() {
            match notification {
                HubCommand::Retire(table) => removed |= table == id,
                HubCommand::Effects(effects) => {
                    observer_booted |= effects
                        .messages
                        .iter()
                        .any(|(session, message)| session.user == 2 && message.starts_with("boot "))
                }
                _ => {}
            }
        }
        ensure!(
            removed && observer_booted,
            "Retirement did not notify the directory and remaining spectator"
        );
        drop(actor);
        ensure!(
            capacity.available_permits() == 1,
            "Abandoned table retained capacity"
        );
    }
    store.close().await?;
    Ok(())
}

#[tokio::test]
async fn restored_pregames_allow_reconnects_and_keep_connected_afk_players() -> Result<()> {
    let (_redis, store, state) = fixture_store("pregame-reconnect-grace").await?;
    let id = store.allocate_table().await?;
    let mut table = pregame(id);
    table.created = Utc::now() - ChronoDuration::days(1);
    let revision = store.save(&table, 0).await?;
    let (hub, _notifications) = mpsc::channel(32);
    let capacity = Arc::new(Semaphore::new(1));
    let mut actor = TableActor::new(
        table,
        revision,
        store.clone(),
        hub,
        capacity.try_acquire_owned()?,
    );
    let now = Instant::now();
    actor.cleanup(now).await?;
    ensure!(
        !actor.retired,
        "Recovery immediately deleted an old pregame"
    );
    let (owner, _frames) = Session::new(1, "Alice".into(), 2, false);
    actor.reattend(owner.clone(), &json!({}), false).await?;
    owner.set_inactive(true);
    let later = now + PREGAME_RECONNECT_GRACE;
    actor.cleanup(later).await?;
    ensure!(
        !actor.retired && state.get(StateId::Table(id)).await?.is_some(),
        "Connected AFK player lost the table"
    );
    owner.cancel.cancel();
    actor.cleanup(later).await?;
    actor
        .cleanup(later + PREGAME_RECONNECT_GRACE - Duration::from_millis(1))
        .await?;
    ensure!(
        !actor.retired,
        "Reconnecting did not reset the disconnect grace period"
    );
    actor.cleanup(later + PREGAME_RECONNECT_GRACE).await?;
    ensure!(
        actor.retired && state.load().await?.is_empty(),
        "Recovered table survived permanent abandonment"
    );
    store.close().await?;
    Ok(())
}

#[tokio::test]
async fn abandoned_pregame_cleanup_does_not_override_frozen_or_newer_state() -> Result<()> {
    let (_redis, store, state) = fixture_store("pregame-cleanup-fence").await?;
    let id = store.allocate_table().await?;
    let table = pregame(id);
    let revision = store.save(&table, 0).await?;
    let (hub, mut notifications) = mpsc::channel(32);
    let capacity = Arc::new(Semaphore::new(1));
    let mut actor = TableActor::new(
        table.clone(),
        revision,
        store.clone(),
        hub,
        capacity.try_acquire_owned()?,
    );
    let now = Instant::now();
    actor.cleanup(now).await?;
    actor.frozen = true;
    ensure!(
        actor.cleanup(now + PREGAME_RECONNECT_GRACE).await.is_err(),
        "Frozen pregame was cleaned up"
    );
    actor.frozen = false;
    let newer = store.save(&table, revision).await?;
    ensure!(
        actor.cleanup(now + PREGAME_RECONNECT_GRACE).await.is_err(),
        "Cleanup overwrote a newer checkpoint"
    );
    ensure!(
        actor.frozen && !actor.retired,
        "Uncertain cleanup did not preserve the table"
    );
    ensure!(
        state
            .get(StateId::Table(id))
            .await?
            .context("Checkpoint deleted")?
            .revision
            == newer,
        "Cleanup removed newer authoritative state"
    );
    ensure!(
        notifications.try_recv().is_err(),
        "Failed cleanup announced retirement"
    );
    store.close().await?;
    Ok(())
}
#[tokio::test]
async fn canceled_reservations_and_uninstalled_tables_release_capacity_after_durable_cleanup()
-> Result<()> {
    let (_redis, store, state) = fixture_store("allocation-cleanup").await?;
    let capacity = Arc::new(Semaphore::new(1));
    for persist in [false, true] {
        let tasks = TaskTracker::new();
        let id = store.allocate_table().await?;
        let mut allocation = Allocation::new(
            id,
            capacity.clone().try_acquire_owned()?,
            store.clone(),
            tasks.clone(),
            0,
        );
        if persist {
            allocation.revision = store.save(&pregame(id), 0).await?;
        }
        ensure!(
            capacity.available_permits() == 0,
            "Allocation did not retain capacity"
        );
        drop(allocation);
        tasks.close();
        tokio::time::timeout(Duration::from_secs(3), tasks.wait()).await?;
        ensure!(
            state.get(StateId::Table(id)).await?.is_none(),
            "Canceled creation leaked same-owner state"
        );
        ensure!(
            capacity.available_permits() == 1,
            "Cleanup did not release capacity"
        );
    }
    store.close().await?;
    Ok(())
}
#[tokio::test]
async fn full_table_mailboxes_do_not_block_hub_and_replacements_fence_private_effects() -> Result<()>
{
    let (_redis, store, _state) = fixture_store("hub-fencing").await?;
    let (sender, receiver) = mpsc::channel(16);
    let (old, mut old_frames) = Session::new(1, "Alice".into(), 1, false);
    let (table_sender, _table_receiver) = mpsc::channel(1);
    let (drain, _drained) = oneshot::channel();
    table_sender
        .try_send(TableCommand::Drain(drain))
        .map_err(|_| anyhow::anyhow!("fixture mailbox"))?;
    let view = TableView {
        players: vec![1],
        replay: false,
        visible: false,
        data: json!({}),
        inspection: json!({}),
        reconnects: BTreeMap::new(),
    };
    let mut hub = Hub {
        receiver,
        sender: sender.clone(),
        sessions: HashMap::new(),
        tables: HashMap::new(),
        closing: false,
        maintenance: false,
        shutdown_imminent: false,
        store: store.clone(),
        words: Arc::new(vec!["alpha".into(), "beta".into(), "gamma".into()]),
        tasks: TaskTracker::new(),
        capacity: Arc::new(Semaphore::new(1)),
        playing_claims: Arc::new(Mutex::new(HashSet::new())),
    };
    hub.sessions.insert(
        1,
        Presence {
            session: old.clone(),
            status: 2,
            table: Some(42),
        },
    );
    hub.tables.insert(
        42,
        Entry {
            handle: TableHandle {
                sender: table_sender,
                cleanup: Arc::new(Notify::new()),
            },
            view: view.clone(),
            published: true,
        },
    );
    let task = tokio::spawn(hub.run());
    let (reply, received) = oneshot::channel();
    sender
        .send(HubCommand::Route {
            session: old.clone(),
            table: 42,
            command: Command::Info(1),
            reply,
        })
        .await?;
    ensure!(
        tokio::time::timeout(Duration::from_secs(1), received)
            .await??
            .is_err(),
        "Saturated table queue admitted work"
    );
    let (reply, received) = oneshot::channel();
    sender
        .send(HubCommand::Name {
            session: old.clone(),
            reply,
        })
        .await?;
    tokio::time::timeout(Duration::from_secs(1), received).await???;
    ensure!(old_frames.try_recv().is_ok(), "Hub blocked on table");
    let (new, mut new_frames) = Session::new(1, "Alice".into(), 2, false);
    let (reply, received) = oneshot::channel();
    sender
        .send(HubCommand::Register {
            session: new.clone(),
            welcome: json!({}),
            initial: vec![],
            reply,
        })
        .await?;
    received.await??;
    ensure!(!old.active(), "Replacement did not cancel old session");
    sender
        .send(HubCommand::Effects(Effects {
            table: 42,
            view,
            statuses: vec![(old.clone(), 2, Some(42))],
            messages: vec![(old.clone(), "secret private frame".into())],
        }))
        .await?;
    let (reply, received) = oneshot::channel();
    sender
        .send(HubCommand::Name {
            session: new.clone(),
            reply,
        })
        .await?;
    received.await??;
    while let Ok(frame) = new_frames.try_recv() {
        ensure!(
            !frame.message.to_text()?.contains("secret"),
            "Old-generation secret reached new socket"
        );
    }
    ensure!(
        old_frames.try_recv().is_err(),
        "Old generation received private output"
    );
    let (reply, received) = oneshot::channel();
    sender.send(HubCommand::Stop(reply)).await?;
    received.await?;
    task.await?;
    store.close().await?;
    Ok(())
}
