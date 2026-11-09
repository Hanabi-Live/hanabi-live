use super::*;
use super::{
    chat::{authored_chat, parse_start_minutes, player_chat_has_room, server_chat},
    replay::undo_hypothetical_turn,
    setup::{next_requested_seed, option_changes, requested_seed, validate_table_name},
    wire::{game_action, game_action_list},
};
use crate::transport::test_frame;
use crate::{
    game::{Game, Options},
    model::{
        ExtraOptions, FORMAT, IDLE_TIMEOUT_MS, IDLE_WARNING_MS, Phase, Player, ReplayState,
        TableChat, TableSnapshot,
    },
    store::Store,
    transport::Session,
};
use crate::{state::RedisState, test_redis::RedisFixture};
use anyhow::{Context, Result, ensure};
use chrono::{Duration as ChronoDuration, Utc};
use hanabi_engine::{CompletionTiming, EndCondition, Recipient};
use hanabi_protocol::{MAX_SEED_LENGTH, ReplayAction, Status};
use serde_json::{Value, json};
use sqlx::postgres::PgPoolOptions;
use std::{
    collections::{BTreeMap, HashMap, HashSet},
    sync::{Arc, Mutex},
    time::{Duration, Instant},
};
use tokio::sync::{Notify, Semaphore, mpsc, oneshot};
use tokio_util::task::TaskTracker;

#[test]
fn table_names_allow_owner_defaults_but_reject_markup() {
    for name in ["Alice's table", "Ren\u{e9}'s table", "Rene\u{301}'s table"] {
        assert!(validate_table_name(name).is_ok(), "{name}");
    }
    for name in ["<script>", "unsafe\nname", "\"attribute\""] {
        assert!(validate_table_name(name).is_err(), "{name}");
    }
}

#[test]
fn requested_seeds_are_validated_and_restarts_count_them_up() {
    assert_eq!(requested_seed(None).unwrap(), "");
    assert_eq!(requested_seed(Some(" match-1 ")).unwrap(), "match-1");
    let longest = "a".repeat(MAX_SEED_LENGTH);
    assert!(requested_seed(Some(&longest)).is_ok());
    for seed in ["has space", "p2v0s1!", &format!("{longest}a")] {
        assert!(requested_seed(Some(seed)).is_err(), "{seed}");
    }
    for (seed, next) in [
        ("", ""),
        ("game", "game1"),
        ("game-9", "game-10"),
        ("007", "008"),
    ] {
        assert_eq!(next_requested_seed(seed).unwrap(), next);
    }
    let full = format!("{}9", "a".repeat(MAX_SEED_LENGTH - 1));
    assert!(next_requested_seed(&full).is_err());
}

#[test]
fn typed_game_frames_preserve_wire_schema_and_projected_identities() -> Result<()> {
    let mut game = Game::new(crate::game::standard_deck("p2v0s1")?)?;
    let rank = game.deck[game.players[1].hand[0]].rank;
    game.apply(
        0,
        ReplayAction {
            kind: hanabi_protocol::RecordedActionType::RankClue,
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
        let encoded = test_frame("gameActionList", game_action_list(42, &list));
        let (command, body) = encoded
            .split_once(' ')
            .context("Missing protocol separator")?;
        assert_eq!(command, "gameActionList");
        let body: Value = serde_json::from_str(body)?;
        assert_eq!(body, json!({"tableID":42,"list":list}));
        for (event, expected) in list.iter().zip(body["list"].as_array().unwrap()) {
            let encoded = test_frame("gameAction", game_action(42, event));
            let (command, body) = encoded
                .split_once(' ')
                .context("Missing action separator")?;
            assert_eq!(command, "gameAction");
            let body: Value = serde_json::from_str(body)?;
            assert_eq!(body, json!({"tableID":42,"action":expected}));
            if expected["type"] == "draw" {
                let player = usize::try_from(expected["playerIndex"].as_u64().unwrap()).unwrap();
                let order = usize::try_from(expected["order"].as_u64().unwrap()).unwrap();
                let (suit, rank) = if hidden == Some(player) {
                    (-1, -1)
                } else {
                    (
                        hanabi_engine::int(game.deck[order].suit_index),
                        game.deck[order].rank,
                    )
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
fn option_summaries_include_only_changes_and_escape_values() {
    let mut table = pregame(1);
    table.options.timed = true;
    table.options.time_base = 120.0;
    table.options.time_per_turn = 20;
    let mut options = table.options.clone();
    assert_eq!(
        option_changes(&table, &options, &table.name, table.max_players, ""),
        ""
    );
    options.time_base = 150.5;
    assert_eq!(
        option_changes(&table, &options, &table.name, table.max_players, ""),
        "<span class=\"cp\">Timed: <b>150.5 / 20</b></span>"
    );
    options.time_base = 120.0;
    options.time_per_turn = 30;
    assert!(
        option_changes(&table, &options, &table.name, table.max_players, "").contains("120 / 30")
    );
    options.timed = false;
    assert_eq!(
        option_changes(&table, &options, &table.name, table.max_players, ""),
        "<span class=\"cp\">Timed: <b>No</b></span>"
    );
    table.options.timed = false;
    options.timed = true;
    assert!(
        option_changes(&table, &options, &table.name, table.max_players, "").contains("120 / 30")
    );
    options.timed = false;
    options.deck_plays = true;
    options.empty_clues = true;
    options.one_extra_card = true;
    options.one_less_card = true;
    options.all_or_nothing = true;
    options.speedrun = true;
    options.detrimental_characters = true;
    let summary = option_changes(&table, &options, "<new>", 2, "match-1");
    assert!(summary.contains("Table Name: <b>&lt;new&gt;</b>"));
    assert!(summary.contains("Seed: <b>match-1</b>"));
    assert!(summary.contains("Max Players: <b>2</b>"));
    assert!(!summary.contains("Timed:"));
    for label in [
        "Bottom-Deck",
        "Empty Clues",
        "One Extra Card",
        "One Less Card",
        "All or Nothing",
        "Speedrun",
        "Detrimental Characters",
    ] {
        assert!(summary.contains(&format!("{label}: <b>Yes</b>")));
    }
    table.options = options.clone();
    options.deck_plays = false;
    assert_eq!(
        option_changes(&table, &options, &table.name, table.max_players, ""),
        "<span class=\"cp\">Bottom-Deck: <b>No</b></span>"
    );
}

#[test]
fn countdown_accepts_float_syntax_and_rejects_nonfinite_values() {
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
        typing_until: None,
    }
}

#[tokio::test]
async fn joining_or_reattending_an_old_review_does_not_immediately_close_it() -> Result<()> {
    let (_redis, store, state) = fixture_store("review-join-idle").await?;
    for shared in [true, false] {
        let id = store.allocate_table().await?;
        let mut table = review(id, EndCondition::TerminatedByPlayer)?;
        table.visible = shared;
        table.game_mut().unwrap().idle_remaining = 1000;
        let finished = table.game().unwrap().finished;
        let duration = table.game().unwrap().duration;
        let clocks = table.game().unwrap().clocks.clone();
        let revision = store.save(&table, 0).await?;
        let (hub, _notifications) = mpsc::channel(16);
        let capacity = Arc::new(Semaphore::new(1));
        let mut actor = TableActor::new(
            table,
            revision,
            store.clone(),
            hub,
            capacity.try_acquire_owned()?,
            crate::server_info::test_info(),
        );
        actor.anchor = Instant::now()
            .checked_sub(Duration::from_millis(900))
            .unwrap();
        let (viewer, _frames) = Session::new(if shared { 3 } else { 1 }, "Viewer".into(), 1, false);
        actor.reattend(viewer, shared, None).await?;
        actor.anchor -= Duration::from_secs(2);
        actor.tick().await?;
        ensure!(
            !actor.retired,
            "Joining an old review immediately closed it"
        );
        let saved = state.get(id).await?.context("Review was deleted")?;
        let restored = TableSnapshot::decode(&saved.payload)?;
        let snapshot = restored.game().context("Missing review")?;
        ensure!(
            snapshot.idle_remaining == IDLE_TIMEOUT_MS,
            "Viewer did not receive a fresh review window"
        );
        ensure!(
            snapshot.finished == finished
                && snapshot.duration == duration
                && snapshot.clocks == clocks,
            "Joining rewrote the completed game's timing"
        );
        actor.retire().await?;
    }
    store.close().await?;
    Ok(())
}

#[tokio::test]
async fn idle_reviews_expire_without_someone_joining() -> Result<()> {
    let (_redis, store, state) = fixture_store("review-idle-tick").await?;
    let id = store.allocate_table().await?;
    let mut table = review(id, EndCondition::TerminatedByPlayer)?;
    table.game_mut().unwrap().idle_remaining = 1000;
    let revision = store.save(&table, 0).await?;
    let (hub, mut notifications) = mpsc::channel(16);
    let capacity = Arc::new(Semaphore::new(1));
    let mut actor = TableActor::new(
        table,
        revision,
        store.clone(),
        hub,
        capacity.try_acquire_owned()?,
        crate::server_info::test_info(),
    );
    actor.anchor = Instant::now().checked_sub(Duration::from_secs(2)).unwrap();
    actor.tick().await?;
    ensure!(
        actor.retired && state.get(id).await?.is_none(),
        "Idle review required a visitor before expiring"
    );
    let mut removed = false;
    while let Ok(notification) = notifications.try_recv() {
        if let HubCommand::Retire(table) = notification {
            removed |= table == id;
        }
    }
    ensure!(removed, "Idle review remained in the lobby");
    store.close().await?;
    Ok(())
}

#[tokio::test]
async fn completion_starts_a_fresh_review_without_reviving_idle_ended_games() -> Result<()> {
    let (_redis, store, state) = fixture_store("review-transition-idle").await?;
    for condition in [EndCondition::TerminatedByPlayer, EndCondition::IdleTimeout] {
        let id = store.allocate_table().await?;
        let mut table = review(id, condition)?;
        let Phase::Replay { snapshot, .. } = table.phase else {
            unreachable!()
        };
        table.phase = Phase::Live { snapshot };
        table.extra.no_write_to_database = true;
        table.game_mut().unwrap().idle_remaining = 0;
        let revision = store.save(&table, 0).await?;
        let (hub, _notifications) = mpsc::channel(16);
        let capacity = Arc::new(Semaphore::new(1));
        let mut actor = TableActor::new(
            table,
            revision,
            store.clone(),
            hub,
            capacity.try_acquire_owned()?,
            crate::server_info::test_info(),
        );
        actor.persist(actor.candidate()).await?;
        let idle_ended = condition == EndCondition::IdleTimeout;
        let expected = if idle_ended { 0 } else { IDLE_TIMEOUT_MS };
        ensure!(
            matches!(actor.table.phase, Phase::Replay { .. }),
            "Completion did not become a review"
        );
        ensure!(
            actor.table.game().unwrap().idle_remaining == expected,
            "Review inherited the wrong idle budget"
        );
        actor.tick().await?;
        ensure!(
            actor.retired == idle_ended,
            "Completion changed idle-end cleanup semantics"
        );
        if !actor.retired {
            actor.retire().await?;
        }
        ensure!(
            state.load().await?.is_empty(),
            "Test review remained indexed"
        );
    }
    store.close().await?;
    Ok(())
}

/// Counts the published messages of one command, emptying the notifications.
fn published(notifications: &mut mpsc::Receiver<HubCommand>, command: &str) -> usize {
    let prefix = format!("{command} ");
    let mut count = 0;
    while let Ok(notification) = notifications.try_recv() {
        if let HubCommand::Effects(effects) = notification {
            count += effects
                .messages
                .iter()
                .filter(|(_, message)| message.starts_with(&prefix))
                .count();
        }
    }
    count
}

#[tokio::test]
async fn idle_live_games_warn_once_and_players_can_keep_them_going() -> Result<()> {
    let (_redis, store, _state) = fixture_store("live-idle-warning").await?;
    let id = store.allocate_table().await?;
    let imported = replay_helpers::parse(&hanabi_protocol::decode(
        &json!({"players":["Alice","Bob"],"seed":"p2v0s1"}),
    )?)?;
    let mut snapshot = replay_helpers::snapshot(imported, id, 1);
    snapshot.idle_remaining = IDLE_WARNING_MS;
    let mut table = pregame(id);
    table.options = snapshot.game.options.clone();
    table.phase = Phase::Live {
        snapshot: Box::new(snapshot),
    };
    let revision = store.save(&table, 0).await?;
    let (hub, mut notifications) = mpsc::channel(64);
    let capacity = Arc::new(Semaphore::new(1));
    let mut actor = TableActor::new(
        table,
        revision,
        store.clone(),
        hub,
        capacity.try_acquire_owned()?,
        crate::server_info::test_info(),
    );
    let player = actor.table.players()[0].id;
    let (alice, _alice_frames) = Session::new(player, "Alice".into(), 1, false);
    let (viewer, _viewer_frames) = Session::new(99, "Viewer".into(), 1, false);
    actor.reattend(alice.clone(), false, None).await?;
    actor.reattend(viewer.clone(), true, None).await?;
    published(&mut notifications, "idleWarning");

    // Both attendees are warned once, not on every tick.
    actor.tick().await?;
    actor.tick().await?;
    ensure!(
        published(&mut notifications, "idleWarning") == 2,
        "The table was not warned exactly once"
    );

    // Only players can keep the game going.
    ensure!(
        actor.idle_reset(viewer.clone()).await.is_err(),
        "A spectator kept an idle game going"
    );
    actor.idle_reset(alice.clone()).await?;
    ensure!(
        actor.table.game().unwrap().idle_remaining == IDLE_TIMEOUT_MS,
        "Keeping the game going did not restart the idle timer"
    );
    ensure!(
        published(&mut notifications, "idleReset") == 2,
        "The table was not told that the game was kept going"
    );

    // The warning is sent again the next time the game is about to end.
    actor.table.game_mut().unwrap().idle_remaining = IDLE_WARNING_MS;
    actor.anchor = Instant::now();
    actor.tick().await?;
    ensure!(
        published(&mut notifications, "idleWarning") == 2,
        "The table was not warned again"
    );
    store.close().await?;
    Ok(())
}

#[tokio::test]
async fn spectating_a_live_game_does_not_refresh_its_idle_deadline() -> Result<()> {
    let (_redis, store, _state) = fixture_store("live-spectator-idle").await?;
    let id = store.allocate_table().await?;
    let imported = replay_helpers::parse(&hanabi_protocol::decode(
        &json!({"players":["Alice","Bob"],"seed":"p2v0s1"}),
    )?)?;
    let mut snapshot = replay_helpers::snapshot(imported, id, 1);
    snapshot.idle_remaining = 1000;
    let mut table = pregame(id);
    table.options = snapshot.game.options.clone();
    table.phase = Phase::Live {
        snapshot: Box::new(snapshot),
    };
    let revision = store.save(&table, 0).await?;
    let (hub, _notifications) = mpsc::channel(16);
    let capacity = Arc::new(Semaphore::new(1));
    let mut actor = TableActor::new(
        table,
        revision,
        store.clone(),
        hub,
        capacity.try_acquire_owned()?,
        crate::server_info::test_info(),
    );
    actor.anchor = Instant::now()
        .checked_sub(Duration::from_millis(900))
        .unwrap();
    let (viewer, _frames) = Session::new(3, "Viewer".into(), 1, false);
    actor.reattend(viewer, true, None).await?;
    ensure!(
        actor.table.game().unwrap().idle_remaining <= 1000,
        "A spectator kept an idle live game alive"
    );
    store.close().await?;
    Ok(())
}

pub(super) fn review(id: u64, condition: EndCondition) -> Result<TableSnapshot> {
    let mut imported = replay_helpers::parse(&hanabi_protocol::decode(
        &json!({"players":["Alice","Bob"],"seed":"p2v0s1"}),
    )?)?;
    imported.game.terminate(0, condition, -1, None, None)?;
    let snapshot = replay_helpers::snapshot(imported, id, 1);
    let mut table = pregame(id);
    table.options = snapshot.game.options.clone();
    table.phase = Phase::Replay {
        replay: ReplayState {
            leader: 1,
            segment: snapshot.game.turn,
            efficiency_modifier: 0,
            hypothetical: false,
            hypothetical_actions: vec![],
            show_drawn_cards: false,
            spoiler_free: false,
            restart_declined: vec![],
        },
        snapshot: Box::new(snapshot),
    };
    Ok(table)
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
            crate::server_info::test_info(),
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
            .cleanup(
                (now + PREGAME_RECONNECT_GRACE)
                    .checked_sub(Duration::from_millis(1))
                    .unwrap(),
            )
            .await?;
        ensure!(
            !actor.retired && state.get(id).await?.is_some(),
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
                    observer_booted |= effects.messages.iter().any(|(session, message)| {
                        session.user == 2 && message.starts_with("boot ")
                    });
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
        crate::server_info::test_info(),
    );
    let now = Instant::now();
    actor.cleanup(now).await?;
    ensure!(
        !actor.retired,
        "Recovery immediately deleted an old pregame"
    );
    let (owner, _frames) = Session::new(1, "Alice".into(), 2, false);
    actor.reattend(owner.clone(), false, None).await?;
    owner.set_inactive(true);
    let later = now + PREGAME_RECONNECT_GRACE;
    actor.cleanup(later).await?;
    ensure!(
        !actor.retired && state.get(id).await?.is_some(),
        "Connected AFK player lost the table"
    );
    owner.cancel.cancel();
    actor.cleanup(later).await?;
    actor
        .cleanup(
            (later + PREGAME_RECONNECT_GRACE)
                .checked_sub(Duration::from_millis(1))
                .unwrap(),
        )
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
        crate::server_info::test_info(),
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
        state.get(id).await?.context("Checkpoint deleted")?.revision == newer,
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
            state.get(id).await?.is_none(),
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
        replay_game: None,
        visible: false,
        data: test_table(),
        inspection: json!({}),
        reconnects: BTreeMap::new(),
    };
    let mut hub = Hub {
        receiver,
        sender: sender.clone(),
        sessions: HashMap::new(),
        tables: HashMap::new(),
        closing: false,
        store: store.clone(),
        tasks: TaskTracker::new(),
        capacity: Arc::new(Semaphore::new(1)),
        playing_claims: Arc::new(Mutex::new(HashSet::new())),
        info: crate::server_info::test_info(),
    };
    hub.sessions.insert(
        1,
        Presence {
            session: old.clone(),
            status: Status::Playing,
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
    let (reply, replied) = oneshot::channel();
    sender
        .send(HubCommand::Route {
            session: old.clone(),
            table: 42,
            command: Command::Client(Box::new(client_message(
                "getGameInfo1",
                &json!({"tableID":42}),
            )?)),
            reply,
        })
        .await?;
    ensure!(
        tokio::time::timeout(Duration::from_secs(1), replied)
            .await??
            .is_err(),
        "Saturated table queue admitted work"
    );
    let (reply, replied) = oneshot::channel();
    sender
        .send(HubCommand::Sync {
            session: old.clone(),
            reply,
        })
        .await?;
    tokio::time::timeout(Duration::from_secs(1), replied).await???;
    ensure!(old_frames.try_recv().is_ok(), "Hub blocked on table");
    let (new, mut new_frames) = Session::new(1, "Alice".into(), 2, false);
    let (reply, replied) = oneshot::channel();
    sender
        .send(HubCommand::Register {
            session: new.clone(),
            welcome: test_welcome(),
            initial: vec![],
            reply,
        })
        .await?;
    replied.await??;
    ensure!(!old.active(), "Replacement did not cancel old session");
    sender
        .send(HubCommand::Effects(Effects {
            table: 42,
            view,
            statuses: vec![(old.clone(), Status::Playing, Some(42))],
            messages: vec![(old.clone(), "secret private frame".into())],
        }))
        .await?;
    let (reply, replied) = oneshot::channel();
    sender
        .send(HubCommand::Sync {
            session: new.clone(),
            reply,
        })
        .await?;
    replied.await??;
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
    let (reply, replied) = oneshot::channel();
    sender.send(HubCommand::Stop(reply)).await?;
    replied.await?;
    task.await?;
    store.close().await?;
    Ok(())
}

#[test]
fn a_table_chat_that_players_filled_still_fits_in_a_checkpoint() -> Result<()> {
    const CHAT_BATCH: usize = 64;
    let mut table = review(1, EndCondition::TerminatedByPlayer)?;
    let name = "x".repeat(crate::accounts::MAX_USERNAME_LENGTH);
    // Quotes are the characters that grow the most when escaped as HTML.
    let text = crate::accounts::normalize_chat(&"\"".repeat(1000)).map_err(anyhow::Error::msg)?;
    // Checking after each batch instead of each message overshoots the budget, which only makes
    // the table larger.
    while player_chat_has_room(&table.chat)? {
        for _ in 0..CHAT_BATCH {
            table.chat.push(TableChat {
                id: None,
                user: 1,
                message: json!(authored_chat(u64::MAX, &name, &text)),
            });
        }
    }
    let notice = format!("{name} left the game.");
    while table.chat.len() < crate::model::MAX_TABLE_CHAT {
        table.chat.push(TableChat {
            id: None,
            user: 0,
            message: json!(server_chat(u64::MAX, &notice)),
        });
    }
    let size = serde_json::to_vec(&table)?.len();
    ensure!(
        size <= crate::state::MAX_CHECKPOINT_BYTES,
        "A full table chat takes {size} bytes, more than a checkpoint's {} bytes",
        crate::state::MAX_CHECKPOINT_BYTES
    );
    Ok(())
}

#[test]
fn hypothetical_back_keeps_morphs() {
    let action = |kind: &str, n: i64| json!({"type":kind,"order":n}).to_string();
    let mut actions = vec![
        action("play", 0),
        action("turn", 1),
        action("morph", 2),
        action("discard", 3),
        action("draw", 4),
        action("turn", 5),
        action("unmorph", 6),
    ];
    undo_hypothetical_turn(&mut actions);
    assert_eq!(
        actions,
        [
            action("play", 0),
            action("turn", 1),
            action("morph", 2),
            action("unmorph", 6),
        ]
    );
    undo_hypothetical_turn(&mut actions);
    assert_eq!(actions, [action("morph", 2), action("unmorph", 6)]);
    undo_hypothetical_turn(&mut actions);
    assert_eq!(actions, [action("morph", 2), action("unmorph", 6)]);
}
