use super::chat::TABLE_CHAT_LIMIT;
use super::*;
use crate::errors::{CommandError, CommandResult};
use crate::{accounts::test_support::TestDb, state::LiveState, transport::Outbound};
use crate::{
    model::{IDLE_TIMEOUT_MS, Phase, Player, TableSnapshot},
    operations::Operation,
    store::Store,
    transport::Session,
};
use anyhow::{Context, Result, bail, ensure};
use chrono::{Duration as ChronoDuration, Utc};
use hanabi_engine::EndCondition;
use hanabi_protocol::PlayerIndex;
use serde_json::{Value, json};
use std::{
    collections::BTreeSet,
    sync::Arc,
    time::{Duration, Instant},
};
use tokio::sync::{Semaphore, mpsc, oneshot};
use tokio_util::task::TaskTracker;

/// Each harness runs a hub and several sessions against one database.
const MAX_CONNECTIONS: u32 = 8;

struct Harness {
    db: TestDb,
    store: Store,
    state: LiveState,
    hub: mpsc::Sender<HubCommand>,
    tasks: TaskTracker,
    users: Vec<Arc<Session>>,
    outgoing: Vec<mpsc::Receiver<Outbound>>,
}
/// Whether a harness user is a bot account, which the tests mark by name.
fn is_test_bot(name: &str) -> bool {
    name.starts_with("Bot-")
}
fn test_session(
    user: i32,
    name: &str,
    generation: u64,
) -> (Arc<Session>, mpsc::Receiver<Outbound>) {
    Session::with_token(
        crate::transport::Identity {
            user: UserId(user),
            name: name.into(),
            normalized_name: crate::accounts::normalize_username(name),
            ip: String::new(),
            bot: is_test_bot(name),
        },
        generation,
        tokio_util::sync::CancellationToken::new(),
        Arc::new(Semaphore::new(crate::transport::GLOBAL_OUTPUT_BYTES)),
    )
}
impl Harness {
    async fn new(names: &[&str]) -> Result<Option<Self>> {
        let Some(db) = TestDb::with_max_connections(MAX_CONNECTIONS).await else {
            return Ok(None);
        };
        let pool = db.pool.clone();
        for (index, name) in names.iter().enumerate() {
            sqlx::query!("INSERT INTO users(id,username,normalized_username,password_hash,last_ip,is_bot) VALUES($1,$2,$3,'fixture','127.0.0.1',$4)", hanabi_engine::int(index)+1, name, crate::accounts::normalize_username(name), is_test_bot(name)).execute(&pool).await?;
        }
        let state = LiveState::for_test(&pool).await?;
        let store = Store::fixture(pool, state.clone());
        let tasks = TaskTracker::new();
        let hub = Hub::start(
            store.clone(),
            tasks.clone(),
            crate::server_info::test_info(),
            crate::integrations::IntegrationSlot::default(),
        )
        .await?;
        let mut h = Self {
            db,
            store,
            state,
            hub,
            tasks,
            users: vec![],
            outgoing: vec![],
        };
        for (index, name) in names.iter().enumerate() {
            let (session, outgoing) = test_session(hanabi_engine::int(index) + 1, name, 1);
            h.register(session.clone()).await?;
            h.users.push(session);
            h.outgoing.push(outgoing);
        }
        Ok(Some(h))
    }
    async fn register(&self, session: Arc<Session>) -> Result<()> {
        let (reply, replied) = oneshot::channel();
        self.hub
            .send(HubCommand::Register {
                session,
                blocks: BTreeSet::new(),
                welcome: test_welcome(),
                initial: vec![],
                reply,
            })
            .await?;
        Ok(replied.await??)
    }
    async fn replace(&mut self, index: usize) -> Result<(Arc<Session>, mpsc::Receiver<Outbound>)> {
        let old = self.users[index].clone();
        let (session, outgoing) = test_session(old.user.0, &old.name, old.generation + 1);
        self.register(session.clone()).await?;
        self.users[index] = session;
        Ok((old, std::mem::replace(&mut self.outgoing[index], outgoing)))
    }
    async fn begin(
        &self,
        index: usize,
        command: &str,
        data: Value,
    ) -> Result<oneshot::Receiver<CommandResult>> {
        let (reply, replied) = oneshot::channel();
        self.hub
            .send(HubCommand::Client {
                session: self.users[index].clone(),
                message: client_message(command, &data)?,
                reply,
            })
            .await?;
        Ok(replied)
    }
    async fn send(&self, index: usize, command: &str, data: Value) -> Result<()> {
        tokio::time::timeout(
            Duration::from_secs(10),
            self.begin(index, command, data).await?,
        )
        .await???;
        Ok(())
    }
    async fn barrier(&self, index: usize) -> Result<()> {
        let (reply, replied) = oneshot::channel();
        self.hub
            .send(HubCommand::Directory {
                session: self.users[index].clone(),
                reply,
            })
            .await?;
        replied.await??;
        Ok(())
    }
    fn frames(&mut self, index: usize) -> Result<Vec<(String, Value)>> {
        let mut values = vec![];
        while let Ok(frame) = self.outgoing[index].try_recv() {
            if let Ok(text) = frame.message.to_text()
                && let Some((command, body)) = text.split_once(' ')
            {
                values.push((command.into(), serde_json::from_str(body)?));
            }
        }
        Ok(values)
    }
    async fn receive(&mut self, index: usize, command: &str) -> Result<Value> {
        tokio::time::timeout(Duration::from_secs(15), async {
            while let Some(frame) = self.outgoing[index].recv().await {
                if let Ok(text) = frame.message.to_text()
                    && let Some((name, body)) = text.split_once(' ')
                    && name == command
                {
                    return Ok(serde_json::from_str(body)?);
                }
            }
            bail!("Socket ended while waiting for {command}")
        })
        .await?
    }
    /// Creates a table named `name`, with the other `settings` that are given.
    async fn create(&mut self, index: usize, name: &str, mut settings: Value) -> Result<TableId> {
        settings["name"] = json!(name);
        self.send(index, "tableCreate", json!({ "settings": settings }))
            .await?;
        self.receive(index, "tableJoined").await?["tableId"]
            .as_u64()
            .map(TableId)
            .context("Missing table identity")
    }
    async fn replay(&mut self, index: usize) -> Result<TableId> {
        self.send(index,"replayCreate",json!({"source":{"type":"imported","game":{"playerNames":["Alice","Bob"],"seed":"p2v0s1"}},"visibility":{"type":"shared"}})).await?;
        self.receive(index, "tableStarted").await?["tableId"]
            .as_u64()
            .map(TableId)
            .context("Missing replay identity")
    }
    async fn snapshot(&self, id: TableId) -> Result<(TableSnapshot, i64)> {
        self.store.get(id).await?.context("Missing durable table")
    }
    async fn wait_locks(&self, count: i64) -> Result<()> {
        tokio::time::timeout(Duration::from_secs(3),async{
            loop{
                let waiting:i64=sqlx::query_scalar!("SELECT count(*) AS \"v!\" FROM pg_stat_activity WHERE datname=current_database() AND wait_event_type='Lock' AND query LIKE '%user_stats%'").fetch_one(&self.store.primary).await?;
                if waiting>=count{return Ok::<(),anyhow::Error>(());}
                tokio::time::sleep(Duration::from_millis(10)).await;
            }
        }).await?
    }
    async fn stop_hub(&self) -> Result<()> {
        let (reply, replied) = oneshot::channel();
        self.hub.send(HubCommand::Quiesce(reply)).await?;
        for handle in replied.await? {
            let (reply, replied) = oneshot::channel();
            if handle.sender.send(TableCommand::Drain(reply)).await.is_ok() {
                tokio::time::timeout(Duration::from_secs(10), replied).await???;
            }
        }
        let (reply, replied) = oneshot::channel();
        self.hub.send(HubCommand::Stop(reply)).await?;
        replied.await?;
        self.tasks.close();
        self.tasks.wait().await;
        Ok(())
    }
    async fn restart(&mut self) -> Result<()> {
        self.stop_hub().await?;
        self.start_hub().await
    }
    /// Starts a hub after `stop_hub`, which recovers the saved tables, and reconnects every user.
    async fn start_hub(&mut self) -> Result<()> {
        self.tasks = TaskTracker::new();
        self.hub = Hub::start(
            self.store.clone(),
            self.tasks.clone(),
            crate::server_info::test_info(),
            crate::integrations::IntegrationSlot::default(),
        )
        .await?;
        for index in 0..self.users.len() {
            let old = &self.users[index];
            let (session, outgoing) = Session::new(old.user, old.name.clone(), old.generation + 1);
            self.register(session.clone()).await?;
            self.users[index] = session;
            self.outgoing[index] = outgoing;
        }
        Ok(())
    }
    async fn close(self) -> Result<()> {
        self.stop_hub().await?;
        self.store.close().await?;
        self.db.close().await;
        Ok(())
    }
}
#[tokio::test]
async fn player_shadow_is_cleared_when_a_spectator_joins() -> Result<()> {
    let Some(mut h) = Harness::new(&["Alice", "Bob", "Observer", "Watcher"]).await? else {
        return Ok(());
    };
    let outcome = async {
        let id = h.create(0, "Joining after shadowing", json!({})).await?;
        for index in [1, 2] {
            h.send(
                index,
                "tableSpectate",
                json!({"tableId":id,"shadowingPlayerIndex":0}),
            )
            .await?;
        }
        h.send(1, "tableJoin", json!({"tableId":id})).await?;
        h.send(0, "tableStart", json!({"tableId":id})).await?;
        let (table, _) = h.snapshot(id).await?;
        for (index, player_id, spectator) in [(1, 2, false), (2, 1, true)] {
            let seat = table
                .players()
                .iter()
                .position(|p| p.is(UserId(player_id)))
                .unwrap();
            h.send(index, "gameInitLoad", json!({"tableId":id})).await?;
            let init = h.receive(index, "init").await?;
            ensure!(
                init["mode"]["ourPlayerIndex"] == json!(seat)
                    && init["mode"]["type"] == if spectator { "shadowing" } else { "playing" },
                "Joining changed the player or spectator viewpoint: {init}"
            );
        }
        ensure!(
            table.shadows.get(&UserId(2)).copied().flatten().is_none(),
            "Joining retained a durable shadow selection"
        );
        // A spectator who does not shadow has no seat.
        h.send(3, "tableSpectate", json!({"tableId":id})).await?;
        h.send(3, "gameInitLoad", json!({"tableId":id})).await?;
        let init = h.receive(3, "init").await?;
        ensure!(
            init["mode"] == json!({"type": "spectating"}),
            "A spectator without a shadow received a seat: {init}"
        );
        Ok(())
    }
    .await;
    h.close().await?;
    outcome
}

#[tokio::test]
async fn only_the_start_of_a_game_is_marked_as_just_started() -> Result<()> {
    let Some(mut h) = Harness::new(&["Alice", "Bob", "Cathy"]).await? else {
        return Ok(());
    };
    let outcome = async {
        let id = h.create(0, "Just started", json!({})).await?;
        h.send(1, "tableJoin", json!({"tableId":id})).await?;
        h.send(0, "tableStart", json!({"tableId":id})).await?;
        let started = h.receive(1, "tableStarted").await?;
        ensure!(
            started["stage"] == "justStarted",
            "A player was not told that the game started: {started}"
        );
        h.send(2, "tableSpectate", json!({"tableId":id})).await?;
        let joined = h.receive(2, "tableStarted").await?;
        ensure!(
            joined["stage"] == "inProgress",
            "A spectator who joined a game in progress was told that it started: {joined}"
        );
        Ok(())
    }
    .await;
    h.close().await?;
    outcome
}

#[tokio::test]
async fn player_shadow_from_saved_games_is_cleared_on_reattend() -> Result<()> {
    let Some(mut h) = Harness::new(&["Alice", "Bob"]).await? else {
        return Ok(());
    };
    let outcome = async {
        let id = h.create(0, "Recovered player viewpoint", json!({})).await?;
        h.send(1, "tableJoin", json!({"tableId":id})).await?;
        h.send(0, "tableStart", json!({"tableId":id})).await?;
        h.stop_hub().await?;
        let (mut table, revision) = h.snapshot(id).await?;
        let alice = table
            .players()
            .iter()
            .position(|p| p.is(UserId(1)))
            .unwrap();
        let bob = table
            .players()
            .iter()
            .position(|p| p.is(UserId(2)))
            .unwrap();
        table.shadows.insert(UserId(2), PlayerIndex::new(alice));
        h.store.save_at(&table, revision).await?;
        h.tasks = TaskTracker::new();
        h.hub = Hub::start(
            h.store.clone(),
            h.tasks.clone(),
            crate::server_info::test_info(),
            crate::integrations::IntegrationSlot::default(),
        )
        .await?;
        for index in 0..h.users.len() {
            h.replace(index).await?;
        }
        for restarted in [false, true] {
            if restarted {
                h.restart().await?;
            }
            h.send(1, "tableReattend", json!({"tableId":id})).await?;
            h.send(1, "gameInitLoad", json!({"tableId":id})).await?;
            let init = h.receive(1, "init").await?;
            ensure!(
                init["mode"] == json!({"type": "playing", "ourPlayerIndex": bob}),
                "A recovered player kept another player's viewpoint: {init}"
            );
            ensure!(
                h.snapshot(id)
                    .await?
                    .0
                    .shadows
                    .get(&UserId(2))
                    .copied()
                    .flatten()
                    .is_none(),
                "Reconnect did not clear the durable shadow selection"
            );
        }
        Ok(())
    }
    .await;
    h.close().await?;
    outcome
}

#[tokio::test]
async fn duck_clue_identity_is_private_in_live_history_and_recovery_but_not_completed_replays()
-> Result<()> {
    let Some(mut h) = Harness::new(&["Alice", "Bob", "Carol", "Observer", "Shadow"]).await? else {
        return Ok(());
    };
    let outcome = async {
        let id = h
            .create(
                0,
                "Duck privacy",
                json!({"options":{"variantName":"Duck (5 Suits)"}}),
            )
            .await?;
        for index in 1..3 {
            h.send(index, "tableJoin", json!({"tableId":id})).await?;
        }
        h.send(0, "tableStart", json!({"tableId":id})).await?;
        h.send(3, "tableSpectate", json!({"tableId":id})).await?;
        h.send(
            4,
            "tableSpectate",
            json!({"tableId":id,"shadowingPlayerIndex":0}),
        )
        .await?;
        ensure!(
            h.send(0, "tableSpectate", json!({"tableId":id}))
                .await
                .is_err(),
            "Player obtained an unrestricted spectator view"
        );
        for index in 0..5 {
            h.send(index, "loaded", json!({"tableId":id})).await?;
        }
        h.barrier(0).await?;
        for index in 0..5 {
            h.frames(index)?;
        }
        let mut originals = vec![];
        for clue_type in [
            hanabi_engine::ClueType::Color,
            hanabi_engine::ClueType::Rank,
        ] {
            let (table, _) = h.snapshot(id).await?;
            let game = table.game().unwrap().game.state();
            let seat = game.active_player_index;
            let target = (seat + 1) % game.players.len();
            let values = if clue_type == hanabi_engine::ClueType::Color {
                0..5
            } else {
                1..6
            };
            let (action, value) = values
                .map(|value| {
                    let action = if clue_type == hanabi_engine::ClueType::Color {
                        json!({"type":"clue","receiverIndex":target,"clue":{"type":"color","value":value}})
                    } else {
                        json!({"type":"clue","receiverIndex":target,"clue":{"type":"rank","value":value}})
                    };
                    (action, value)
                })
                .find(|(action, _)| {
                    serde_json::from_value::<hanabi_engine::PlayerAction>(action.clone()).is_ok_and(
                        |action| !hanabi_engine::touched_orders(game, &action).is_empty(),
                    )
                })
                .context("Missing legal clue")?;
            let index = h
                .users
                .iter()
                .position(|user| table.players()[seat].is(user.user))
                .unwrap();
            h.send(index, "playerAction", json!({"tableId":id,"action":action}))
                .await?;
            h.barrier(index).await?;
            let clue = json!({"type":clue_type,"value":value});
            originals.push(clue.clone());
            for index in 0..5 {
                let events = h
                    .frames(index)?
                    .into_iter()
                    .filter(|(name, body)| name == "gameEvent" && body["event"]["type"] == "clue")
                    .map(|(_, body)| body["event"].clone())
                    .collect::<Vec<_>>();
                ensure!(events.len() == 1, "Missing live clue event");
                ensure!(
                    events[0]["clue"]
                        == if index == 3 {
                            clue.clone()
                        } else {
                            Value::Null
                        },
                    "Live clue identity leaked or spectator view changed"
                );
                ensure!(
                    events[0]["orders"]
                        .as_array()
                        .is_some_and(|list| !list.is_empty()),
                    "Public touched cards were lost"
                );
            }
        }
        for recovered in [false, true] {
            if recovered {
                h.restart().await?;
                for index in 0..3 {
                    h.send(index, "tableReattend", json!({"tableId":id}))
                        .await?;
                }
                h.send(3, "tableSpectate", json!({"tableId":id})).await?;
                h.send(
                    4,
                    "tableSpectate",
                    json!({"tableId":id,"shadowingPlayerIndex":0}),
                )
                .await?;
            }
            for index in 0..5 {
                h.send(index, "gameStateLoad", json!({"tableId":id}))
                    .await?;
                let history = h.receive(index, "gameEventList").await?;
                let clues = history["events"]
                    .as_array()
                    .unwrap()
                    .iter()
                    .filter(|event| event["type"] == "clue")
                    .map(|event| event["clue"].clone())
                    .collect::<Vec<_>>();
                let expected = if index == 3 {
                    originals.clone()
                } else {
                    vec![Value::Null; 2]
                };
                ensure!(
                    clues == expected,
                    "Clue identity leaked through history or recovery"
                );
            }
        }
        let (table, _) = h.snapshot(id).await?;
        let authoritative = serde_json::to_value(&table.game().unwrap().game.events)?;
        let saved = authoritative
            .as_array()
            .unwrap()
            .iter()
            .filter(|event| event["type"] == "clue")
            .map(|event| event["clue"].clone())
            .collect::<Vec<_>>();
        ensure!(
            saved == originals,
            "Recipient filtering changed authoritative history"
        );
        h.send(0, "tableTerminate", json!({"tableId":id})).await?;
        for index in 0..5 {
            h.send(index, "gameStateLoad", json!({"tableId":id}))
                .await?;
            let history = h.receive(index, "gameEventList").await?;
            let clues = history["events"]
                .as_array()
                .unwrap()
                .iter()
                .filter(|event| event["type"] == "clue")
                .map(|event| event["clue"].clone())
                .collect::<Vec<_>>();
            ensure!(clues == originals, "Completed replay lost the actual clues");
        }
        Ok(())
    }
    .await;
    h.close().await?;
    outcome
}

#[tokio::test]
async fn leader_transfers_announce_the_actor_and_target_once_to_the_table() -> Result<()> {
    let Some(mut h) = Harness::new(&["Alice<&>", "Bob<&>", "Outsider"]).await? else {
        return Ok(());
    };
    let result = async {
        let id = h.create(0, "Leader announcements", json!({})).await?;
        h.send(1, "tableJoin", json!({"tableId":id})).await?;
        for phase in 0..3 {
            if phase == 1 {
                h.send(1, "tableStart", json!({"tableId":id})).await?;
                for index in 0..2 {
                    h.send(index, "loaded", json!({"tableId":id})).await?;
                }
            } else if phase == 2 {
                h.send(0, "tableTerminate", json!({"tableId":id})).await?;
            }
            h.barrier(0).await?;
            for index in 0..3 {
                h.frames(index)?;
            }
            let before = h.snapshot(id).await?.0.chat.len();
            let actor = usize::from(phase == 1);
            let target = 1 - actor;
            let data = json!({"tableId":id,"ownerId":h.users[target].user});
            h.send(actor, "tableSetOwner", data).await?;
            let expected = format!(
                "{} has passed table ownership to: {}",
                crate::accounts::escape_html(&h.users[actor].name),
                crate::accounts::escape_html(&h.users[target].name)
            );
            h.barrier(0).await?;
            for index in 0..2 {
                let messages = chat_messages(&h.frames(index)?);
                ensure!(
                    messages.len() == 1,
                    "Expected one leader-change announcement"
                );
                ensure!(messages[0]["text"] == expected && messages[0]["source"] == "server");
                ensure!(messages[0].get("recipient").is_none());
            }
            ensure!(
                chat_messages(&h.frames(2)?).is_empty(),
                "Leader notice leaked outside the table"
            );
            let table = h.snapshot(id).await?.0;
            ensure!(table.chat.len() == before + 1 && table.chat[before].message.text == expected);
            ensure!(
                h.send(
                    2,
                    "tableSetOwner",
                    json!({"tableId":id,"ownerId":h.users[actor].user})
                )
                .await
                .is_err()
            );
            ensure!(
                h.send(actor, "tableSetOwner", json!({"tableId":id,"ownerId":99}))
                    .await
                    .is_err()
            );
            ensure!(
                h.send(
                    actor,
                    "tableSetOwner",
                    json!({"tableId":id,"ownerId":h.users[target].user})
                )
                .await
                .is_err()
            );
            h.barrier(0).await?;
            for index in 0..3 {
                ensure!(
                    chat_messages(&h.frames(index)?).is_empty(),
                    "Rejected or duplicate transfer emitted chat"
                );
            }
        }
        Ok::<(), anyhow::Error>(())
    }
    .await;
    let cleanup = h.close().await;
    result?;
    cleanup
}

#[tokio::test]
async fn abandoned_shared_reviews_expire_without_a_new_visitor() -> Result<()> {
    let Some(h) = Harness::new(&["Alice", "Bob"]).await? else {
        return Ok(());
    };
    let outcome = async {
        for recovered in [false, true] {
            let id = h.store.allocate_table().await?;
            let table = tests::review(id, EndCondition::TerminatedByPlayer)?;
            let revision = h.store.save_at(&table, 0).await?;
            let (hub, mut notifications) = mpsc::channel(32);
            let capacity = Arc::new(Semaphore::new(1));
            let saved = h.store.saved_at(table.id, revision).await?;
            let mut actor = TableActor::new(
                table,
                saved,
                h.store.clone(),
                hub,
                capacity.try_acquire_owned()?,
                crate::server_info::test_info(),
            );
            if !recovered {
                actor.initialize(h.users[0].clone(), vec![]).await?;
                h.users[0].cancel.cancel();
            }
            actor
                .cleanup(Instant::now().checked_sub(Duration::from_secs(61)).unwrap())
                .await?;
            ensure!(
                !actor.retired,
                "Empty review did not receive a reconnect grace period"
            );
            let (_sender, receiver) = mpsc::channel(4);
            Box::pin(tokio::time::timeout(
                Duration::from_secs(2),
                actor.run(receiver, None),
            ))
            .await
            .context("Abandoned review did not expire on its own timer")?;
            ensure!(
                h.state.get(id).await?.is_none(),
                "An expired review remained saved"
            );
            let mut retired = false;
            while let Ok(event) = notifications.try_recv() {
                retired |= matches!(event, HubCommand::Retire(retired_id) if retired_id == id);
            }
            ensure!(retired, "Expired review was not removed from the lobby");
        }
        Ok(())
    }
    .await;
    h.close().await?;
    outcome
}

#[tokio::test]
async fn rejoining_a_shared_review_cancels_its_empty_room_deadline() -> Result<()> {
    let Some(h) = Harness::new(&["Alice", "Bob"]).await? else {
        return Ok(());
    };
    let outcome = async {
        let id = h.store.allocate_table().await?;
        let mut table = tests::review(id, EndCondition::TerminatedByPlayer)?;
        table.game_mut().unwrap().idle_remaining = 1;
        let revision = h.store.save_at(&table, 0).await?;
        let (hub, _notifications) = mpsc::channel(32);
        let capacity = Arc::new(Semaphore::new(1));
        let saved = h.store.saved_at(table.id, revision).await?;
        let mut actor = TableActor::new(
            table,
            saved,
            h.store.clone(),
            hub,
            capacity.try_acquire_owned()?,
            crate::server_info::test_info(),
        );
        actor
            .cleanup(Instant::now().checked_sub(Duration::from_secs(61)).unwrap())
            .await?;
        actor
            .reattend(h.users[1].clone(), &BTreeSet::new(), true, None)
            .await?;
        actor.tick().await?;
        ensure!(!actor.retired, "Rejoining a review immediately closed it");
        ensure!(actor.table.game().unwrap().idle_remaining == IDLE_TIMEOUT_MS);
        h.users[1].cancel.cancel();
        let now = Instant::now();
        actor.cleanup(now).await?;
        ensure!(
            !actor.retired,
            "A later disconnect reused the old cleanup deadline"
        );
        actor.cleanup(now + REPLAY_RECONNECT_GRACE).await?;
        ensure!(actor.retired, "Disconnected review did not expire");
        Ok(())
    }
    .await;
    h.close().await?;
    outcome
}

#[tokio::test]
async fn shared_review_chat_refreshes_idle_and_inactive_reviews_expire() -> Result<()> {
    let Some(h) = Harness::new(&["Alice", "Bob"]).await? else {
        return Ok(());
    };
    let outcome = Box::pin(async {
        let id = h.store.allocate_table().await?;
        let table = tests::review(id, EndCondition::TerminatedByPlayer)?;
        let revision = h.store.save_at(&table, 0).await?;
        let (hub, _notifications) = mpsc::channel(32);
        let capacity = Arc::new(Semaphore::new(1));
        let saved = h.store.saved_at(table.id, revision).await?;
        let mut actor = TableActor::new(
            table,
            saved,
            h.store.clone(),
            hub,
            capacity.try_acquire_owned()?,
            crate::server_info::test_info(),
        );
        actor.initialize(h.users[0].clone(), vec![]).await?;
        for text in ["We are still discussing this game.", "/random 1"] {
            let mut next = actor.candidate();
            next.game_mut().unwrap().idle_remaining = 1000;
            actor.persist(next).await?;
            actor.anchor = Instant::now()
                .checked_sub(Duration::from_millis(900))
                .unwrap();
            actor.chat(h.users[0].clone(), text).await?;
            let (saved, _) = h.snapshot(id).await?;
            ensure!(
                saved.game().unwrap().idle_remaining == IDLE_TIMEOUT_MS,
                "Accepted user chat did not renew the shared review"
            );
            actor.anchor -= Duration::from_secs(2);
            actor.tick().await?;
            ensure!(!actor.retired, "Active discussion was closed");
        }
        let mut next = actor.candidate();
        next.game_mut().unwrap().idle_remaining = 1000;
        actor.persist(next).await?;
        actor.anchor = Instant::now()
            .checked_sub(Duration::from_millis(900))
            .unwrap();
        actor.anchor -= Duration::from_secs(2);
        actor.tick().await?;
        ensure!(
            actor.retired && h.state.get(id).await?.is_none(),
            "Inactive review did not expire automatically"
        );
        Ok(())
    })
    .await;
    h.close().await?;
    outcome
}

#[tokio::test]
async fn shared_review_hypothetical_actions_refresh_idle() -> Result<()> {
    let Some(h) = Harness::new(&["Alice"]).await? else {
        return Ok(());
    };
    let outcome = async {
        let id = h.store.allocate_table().await?;
        let table = tests::review(id, EndCondition::TerminatedByPlayer)?;
        let revision = h.store.save_at(&table, 0).await?;
        let (hub, _notifications) = mpsc::channel(32);
        let capacity = Arc::new(Semaphore::new(1));
        let saved = h.store.saved_at(table.id, revision).await?;
        let mut actor = TableActor::new(
            table,
            saved,
            h.store.clone(),
            hub,
            capacity.try_acquire_owned()?,
            crate::server_info::test_info(),
        );
        actor.initialize(h.users[0].clone(), vec![]).await?;
        let action = json!({"type":"turn","turn":1,"currentPlayerIndex":1});
        for request in [
            json!({"tableId":id,"action":{"type":"hypotheticalStart"}}),
            json!({"tableId":id,"action":{"type":"hypotheticalAction","action":action}}),
            json!({"tableId":id,"action":{"type":"hypotheticalBack"}}),
        ] {
            let mut next = actor.candidate();
            next.game_mut().unwrap().idle_remaining = 1000;
            actor.persist(next).await?;
            actor.anchor = Instant::now()
                .checked_sub(Duration::from_millis(900))
                .unwrap();
            actor
                .replay_command(
                    h.users[0].clone(),
                    client_message("replayAction", &request)?,
                )
                .await?;
            let (saved, _) = h.snapshot(id).await?;
            ensure!(
                saved.game().unwrap().idle_remaining == IDLE_TIMEOUT_MS,
                "A hypothetical action did not renew the shared review"
            );
            actor.anchor -= Duration::from_secs(2);
            actor.tick().await?;
            ensure!(!actor.retired, "An active hypothetical was closed");
        }
        Ok(())
    }
    .await;
    h.close().await?;
    outcome
}

#[tokio::test]
async fn shared_replay_spectators_return_to_the_same_replay_after_a_restart() -> Result<()> {
    let Some(mut h) = Harness::new(&["Alice", "Bob", "Carol"]).await? else {
        return Ok(());
    };
    let outcome = async {
        let id = h.replay(0).await?;
        for index in [1, 2] {
            h.send(index, "tableSpectate", json!({"tableId":id}))
                .await?;
        }
        h.restart().await?;
        for index in 0..3 {
            let welcome = h.receive(index, "welcome").await?;
            ensure!(
                welcome["spectatingAtTables"] == json!([{"tableId":id}]),
                "A spectator was not sent back to the restored replay: {welcome}"
            );
            // The client spectates the table it was told about.
            h.send(index, "tableSpectate", json!({"tableId":id}))
                .await?;
            ensure!(
                h.receive(index, "tableStarted").await?["tableId"] == json!(id),
                "A spectator did not rejoin the restored replay"
            );
        }
        let replays = h
            .store
            .load()
            .await?
            .into_iter()
            .filter(|(table, _)| matches!(table.phase, Phase::Replay { .. }))
            .count();
        ensure!(
            replays == 1,
            "The restart duplicated the replay ({replays} replays)"
        );
        Ok(())
    }
    .await;
    h.close().await?;
    outcome
}

#[tokio::test]
async fn tables_replay_a_finished_game_from_a_chosen_turn() -> Result<()> {
    let Some(mut h) = Harness::new(&["Alice", "Bob"]).await? else {
        return Ok(());
    };
    let outcome = async {
        let game: i32 = sqlx::query_scalar!("INSERT INTO games(name,num_players,variant_id,timed,time_base,time_per_turn,
             speedrun,deck_plays,empty_clues,one_extra_card,one_less_card,
             all_or_nothing,detrimental_characters,seed,score,num_turns,end_condition,datetime_started,datetime_finished)
             VALUES('Replayed game',2,0,true,120,20,false,false,false,false,false,false,false,'p2v0s1',0,3,4,NOW(),NOW())
             RETURNING id")
        .fetch_one(&h.store.primary)
        .await?;
        sqlx::query!("INSERT INTO game_participants(game_id,user_id,seat)
             VALUES($1,1,0),($1,2,1)", game)
        .execute(&h.store.primary)
        .await?;
        // Each player plays their first card, and then the game is terminated.
        sqlx::query!("INSERT INTO game_actions(game_id,turn,type,target,value)
             VALUES($1,0,0,0,NULL),($1,1,0,5,NULL),($1,2,4,0,4)", game)
            .execute(&h.store.primary)
            .await?;

        let id = h.create(0, "Replay", json!({"replayGameId":game,"replayTurn":1})).await?;
        let listed = h.receive(1, "table").await?;
        ensure!(
            listed["settings"]["replayGameId"] == game
                && listed["settings"]["replayTurn"] == 1
                && listed["settings"]["options"]["timeControl"].is_object(),
            "The table did not report the replayed game and its options: {listed}"
        );
        h.send(1, "tableJoin", json!({"tableId":id})).await?;
        h.send(0, "tableStart", json!({"tableId":id})).await?;
        let (table, _) = h.snapshot(id).await?;
        let started = table.game().context("The replayed game did not start")?;
        ensure!(
            started.seed.as_deref() == Some("p2v0s1") && started.game.actions.len() == 1,
            "The replay did not start from its second turn"
        );
        Ok(())
    }
    .await;
    h.close().await?;
    outcome
}

#[tokio::test]
async fn shared_replay_links_join_an_existing_replay_of_the_same_game() -> Result<()> {
    let Some(mut h) = Harness::new(&["Alice", "Bob", "Carol"]).await? else {
        return Ok(());
    };
    let outcome = async {
        let game: i32 = sqlx::query_scalar!("INSERT INTO games(name,num_players,variant_id,timed,time_base,time_per_turn,
             speedrun,deck_plays,empty_clues,one_extra_card,one_less_card,
             all_or_nothing,detrimental_characters,seed,score,num_turns,end_condition,datetime_started,datetime_finished)
             VALUES('Linked game',2,0,false,NULL,NULL,false,false,false,false,false,false,false,'p2v0s1',0,1,4,NOW(),NOW())
             RETURNING id")
        .fetch_one(&h.store.primary)
        .await?;
        sqlx::query!("INSERT INTO game_participants(game_id,user_id,seat)
             VALUES($1,1,0),($1,2,1)", game)
        .execute(&h.store.primary)
        .await?;
        // The game was terminated on its first turn.
        sqlx::query!("INSERT INTO game_actions(game_id,turn,type,target,value) VALUES($1,0,4,0,4)", game)
            .execute(&h.store.primary)
            .await?;
        let request = |visibility: Value| json!({"source":{"type":"saved","gameId":game},"visibility":visibility});
        let shared = |join_existing: bool| json!({"type":"shared","joinExisting":join_existing});
        let open = async |h: &mut Harness, index: usize, request: Value| -> Result<Value> {
            h.send(index, "replayCreate", request).await?;
            Ok(h.receive(index, "tableStarted").await?["tableId"].clone())
        };

        let existing = open(&mut h, 0, request(shared(true))).await?;
        let listed = h.receive(2, "table").await?;
        ensure!(
            listed["gameId"] == game,
            "The lobby listing of a shared replay did not name its game: {listed}"
        );
        ensure!(
            open(&mut h, 1, request(shared(true))).await? == existing,
            "A link did not join the existing shared replay"
        );
        ensure!(
            open(&mut h, 2, request(shared(false))).await? != existing,
            "Creating a shared replay from the lobby joined an existing one"
        );
        ensure!(
            open(&mut h, 2, request(json!({"type":"solo"}))).await? != existing,
            "A solo replay joined a shared one"
        );
        Ok(())
    }
    .await;
    h.close().await?;
    outcome
}

#[tokio::test]
async fn spoiler_free_reviews_are_shared_replays_that_tell_everyone() -> Result<()> {
    let Some(mut h) = Harness::new(&["Alice", "Bob"]).await? else {
        return Ok(());
    };
    let outcome = async {
        h.send(
            0,
            "replayCreate",
            json!({"visibility":{"type":"shared","spoilerFree":true},
                "source":{"type":"imported","game":{"playerNames":["Alice","Bob"],"seed":"p2v0s1"}}}),
        )
        .await?;
        let id = h.receive(0, "tableStarted").await?["tableId"].clone();
        h.send(1, "tableSpectate", json!({"tableId":id})).await?;
        h.send(1, "gameInitLoad", json!({"tableId":id})).await?;
        let init = h.receive(1, "init").await?;
        ensure!(
            init["mode"]["type"] == "sharedReplay"
                && init["mode"]["sharedReplay"]["spoilerFree"] == true,
            "A spectator joined a spoiler-free review without being told: {init}"
        );
        // Bob has the name of a player, but he did not play this game at this table.
        ensure!(
            init["mode"]["sharedReplay"]["canPlayAgain"] == false,
            "A replay of an imported game offered a restart: {init}"
        );
        Ok(())
    }
    .await;
    h.close().await?;
    outcome
}

#[tokio::test]
async fn shared_replays_of_older_games_start_when_their_table_is_created() -> Result<()> {
    let Some(mut h) = Harness::new(&["Alice", "Bob"]).await? else {
        return Ok(());
    };
    let outcome = async {
        h.send(
            0,
            "replayCreate",
            json!({"visibility":{"type":"shared"},"source":{"type":"imported","game":{
                "playerNames":["Alice","Bob"],"seed":"p2v0s1",
                "actions":[{"type":"gameOver","endCondition":"terminatedByPlayer","playerIndex":0}]}}}),
        )
        .await?;
        let id = h.receive(0, "tableStarted").await?["tableId"].clone();
        h.stop_hub().await?;
        let (mut table, revision) = h
            .snapshot(TableId(id.as_u64().context("Missing replay identity")?))
            .await?;
        let created = table.created;
        let game = table.game_mut().context("Missing replay game")?;
        game.started = created - chrono::TimeDelta::days(2);
        game.finished = Some(created - chrono::TimeDelta::days(1));
        h.store.save_at(&table, revision).await?;
        h.tasks = TaskTracker::new();
        h.hub = Hub::start(
            h.store.clone(),
            h.tasks.clone(),
            crate::server_info::test_info(),
            crate::integrations::IntegrationSlot::default(),
        )
        .await?;
        for index in 0..h.users.len() {
            h.replace(index).await?;
        }
        h.send(1, "tableSpectate", json!({"tableId":id})).await?;
        h.send(1, "gameInitLoad", json!({"tableId":id})).await?;
        let init = h.receive(1, "init").await?;
        ensure!(
            init["mode"]["sharedReplay"]["startedAt"]
                    == hanabi_protocol::Timestamp::from(created).as_str(),
            "The shared replay did not start when its table was created: {init}"
        );
        Ok(())
    }
    .await;
    h.close().await?;
    outcome
}

#[tokio::test]
async fn joining_a_table_plays_a_sound_for_its_other_players_once_per_burst() -> Result<()> {
    let Some(mut h) = Harness::new(&["Alice", "Bob", "Carol"]).await? else {
        return Ok(());
    };
    let outcome = async {
        // A join right after the table is created plays no sound.
        let id = h.create(0, "Join sound", json!({})).await?;
        h.send(1, "tableJoin", json!({"tableId":id})).await?;
        h.barrier(0).await?;
        ensure!(
            !h.frames(0)?
                .iter()
                .any(|(command, _)| command == "lobbySound"),
            "A join right after the table was created played a sound"
        );

        // A join long after the table is created plays it, but the next join does not.
        let id = h.store.allocate_table().await?;
        let mut table = tests::pregame(id);
        table.created = Utc::now() - ChronoDuration::minutes(1);
        let revision = h.store.save_at(&table, 0).await?;
        let (hub, mut notifications) = mpsc::channel(32);
        let capacity = Arc::new(Semaphore::new(1));
        let saved = h.store.saved_at(table.id, revision).await?;
        let mut actor = TableActor::new(
            table,
            saved,
            h.store.clone(),
            hub,
            capacity.try_acquire_owned()?,
            crate::server_info::test_info(),
        );
        actor.initialize(h.users[0].clone(), vec![]).await?;
        let mut sounds = vec![];
        for index in [1, 2] {
            actor
                .join(h.users[index].clone(), &BTreeSet::new(), None)
                .await?;
            let mut heard = vec![];
            while let Ok(notification) = notifications.try_recv() {
                if let HubCommand::Effects(effects) = notification {
                    for (session, message) in effects.messages {
                        if let Some(body) = message.strip_prefix("lobbySound ") {
                            heard.push((session.user, serde_json::from_str::<Value>(body)?));
                        }
                    }
                }
            }
            sounds.push(heard);
        }
        ensure!(
            sounds == vec![vec![(UserId(1), json!({"sound":"someoneJoined"}))], vec![]],
            "Unexpected join sounds: {sounds:?}"
        );
        Ok(())
    }
    .await;
    h.close().await?;
    outcome
}

/// The server notices in a table's chat.
fn notices(table: &TableSnapshot) -> Vec<String> {
    table
        .chat
        .iter()
        .filter(|c| c.user.is_none())
        .map(|c| c.message.text.clone())
        .collect()
}

#[tokio::test]
async fn pregame_changes_announce_new_owners_and_splits() -> Result<()> {
    let Some(mut h) = Harness::new(&["Alice", "Bob", "Carol", "Dave"]).await? else {
        return Ok(());
    };
    let outcome = async {
        let id = h.create(0, "Notices", json!({})).await?;
        let chat = |msg: &str| json!({"tableId":id,"text":msg});
        for index in [1, 2] {
            h.send(index, "tableJoin", json!({"tableId":id})).await?;
        }
        h.send(3, "tableJoin", json!({"tableId":id})).await?;
        h.send(0, "tableLeave", json!({"tableId":id})).await?;
        h.send(1, "chat", chat("/kick Dave")).await?;
        h.send(1, "chat", chat("/split Bob")).await?;
        let source = notices(&h.snapshot(id).await?.0);
        ensure!(
            source
                == [
                    "Alice created the table.",
                    "Bob joined the game.",
                    "Carol joined the game.",
                    "Dave joined the game.",
                    "Alice left the game.",
                    "Bob is the new table owner.",
                    "Successfully kicked \"Dave\" from the game.",
                    "Bob split Bob into a new lobby.",
                    "Carol is the new table owner.",
                ],
            "Unexpected notices: {source:#?}"
        );
        let split = h
            .store
            .load()
            .await?
            .into_iter()
            .map(|(table, _)| table)
            .find(|table| table.name == "Notices (split)")
            .context("Missing the split table")?;
        ensure!(
            notices(&split) == ["This lobby was created by splitting Notices."],
            "Unexpected split notices: {:#?}",
            notices(&split)
        );
        Ok(())
    }
    .await;
    h.close().await?;
    outcome
}

#[tokio::test]
async fn pausing_a_game_is_announced_in_its_chat() -> Result<()> {
    let Some(mut h) = Harness::new(&["Alice", "Bob"]).await? else {
        return Ok(());
    };
    let outcome = async {
        let id = h
            .create(
                0,
                "Pause",
                json!({"options":{"timeControl":{"baseSeconds":120,"perTurnSeconds":20}}}),
            )
            .await?;
        h.send(1, "tableJoin", json!({"tableId":id})).await?;
        h.send(0, "tableStart", json!({"tableId":id})).await?;
        for index in 0..2 {
            h.send(index, "tableReattend", json!({"tableId":id}))
                .await?;
        }
        h.send(1, "pause", json!({"tableId":id,"setting":"pause"}))
            .await?;
        // A paused game takes no actions, even from the active player.
        let (table, _) = h.snapshot(id).await?;
        let game = &table.game().context("Missing game")?.game;
        let active = game.active_player_index;
        let index = h
            .users
            .iter()
            .position(|user| table.players()[active].is(user.user))
            .context("Missing active player")?;
        let card = game.players[active].hand[0];
        let error = h
            .send(
                index,
                "playerAction",
                json!({"tableId":id,"action":{"type":"play","order":card}}),
            )
            .await
            .err()
            .context("A paused game took an action")?;
        ensure!(
            error.to_string().contains("paused"),
            "Unexpected error: {error}"
        );
        h.send(0, "pause", json!({"tableId":id,"setting":"unpause"}))
            .await?;
        let (table, _) = h.snapshot(id).await?;
        let notices = notices(&table);
        ensure!(
            notices.ends_with(&[
                "Bob paused the game.".into(),
                "Alice unpaused the game.".into()
            ]),
            "Unexpected notices: {notices:#?}"
        );
        Ok(())
    }
    .await;
    h.close().await?;
    outcome
}

#[tokio::test]
async fn trying_to_join_a_full_table_tells_its_players_once() -> Result<()> {
    let Some(mut h) = Harness::new(&["Alice", "Bob", "Carol"]).await? else {
        return Ok(());
    };
    let outcome = async {
        h.send(
            0,
            "tableCreate",
            json!({"settings":{"name":"Full table","maxPlayers":2}}),
        )
        .await?;
        let id = h.receive(0, "tableJoined").await?["tableId"].clone();
        h.send(1, "tableJoin", json!({"tableId":id})).await?;
        h.receive(0, "chat").await?; // "Bob joined the game."
        for _ in 0..2 {
            let error = h
                .send(2, "tableJoin", json!({"tableId":id}))
                .await
                .err()
                .context("Carol joined a full table")?;
            ensure!(
                error.to_string().contains("This table is full."),
                "Unexpected error: {error}"
            );
        }
        let chat = h.receive(0, "chat").await?;
        ensure!(
            chat["text"] == "Carol tried to join, but the table is full.",
            "Unexpected chat: {chat}"
        );
        let (table, _) = h
            .snapshot(TableId(id.as_u64().context("Missing table ID")?))
            .await?;
        let notices = table
            .chat
            .iter()
            .filter(|c| c.message.text.contains("tried to join"))
            .count();
        ensure!(notices == 1, "The table was told {notices} times");
        Ok(())
    }
    .await;
    h.close().await?;
    outcome
}

#[tokio::test]
async fn joining_a_table_with_a_password_checks_the_password() -> Result<()> {
    let Some(mut h) = Harness::new(&["Alice", "Bob"]).await? else {
        return Ok(());
    };
    let outcome = async {
        h.send(
            0,
            "tableCreate",
            json!({"settings":{"name":"Private"},"password":"secret"}),
        )
        .await?;
        let id = h.receive(0, "tableJoined").await?["tableId"].clone();
        let error = h
            .send(1, "tableJoin", json!({"tableId":id,"password":"wrong"}))
            .await
            .err()
            .context("Bob joined with the wrong password")?;
        ensure!(
            error.to_string().contains("Incorrect table password"),
            "Unexpected error: {error}"
        );
        h.send(1, "tableJoin", json!({"tableId":id,"password":"secret"}))
            .await?;
        let (table, _) = h
            .snapshot(TableId(id.as_u64().context("Missing table ID")?))
            .await?;
        ensure!(
            table.seated_users().collect::<Vec<_>>() == [UserId(1), UserId(2)],
            "Bob did not join with the right password"
        );
        Ok(())
    }
    .await;
    h.close().await?;
    outcome
}

#[tokio::test]
async fn blocked_players_cannot_join_or_spectate_each_others_tables() -> Result<()> {
    let Some(mut h) = Harness::new(&["Alice", "Bob", "Carol"]).await? else {
        return Ok(());
    };
    let outcome = async {
        let refused =
            async |h: &Harness, index: usize, command: &str, id: TableId| -> Result<String> {
                match h.send(index, command, json!({"tableId":id})).await {
                    Ok(()) => bail!("{command} was allowed"),
                    Err(error) => Ok(error.to_string()),
                }
            };
        // Run the lobby command and hand its effects to the hub, as the web layer does.
        let change = async |h: &Harness, index: usize, command: &str, name: &str| -> Result<()> {
            let session = h.users[index].clone();
            let caller = session.identity.clone();
            let effects = crate::lobby::dispatch(
                &h.store.primary,
                "secret",
                &caller,
                &[],
                None,
                client_message(command, &json!({"username":name}))?,
            )
            .await?
            .context("Missing lobby effects")?
            .into_iter()
            .map(|effect| match effect {
                crate::lobby::Effect::Publish(publication) => Ok(publication),
                other => Err(anyhow::anyhow!("Unexpected lobby effect: {other:?}")),
            })
            .collect::<Result<Vec<_>>>()?;
            let (reply, replied) = oneshot::channel();
            h.hub
                .send(HubCommand::LobbyEffects {
                    session,
                    effects,
                    reply,
                })
                .await?;
            Ok(replied.await??)
        };

        // Alice blocks Bob: Bob can neither join nor spectate Alice's table.
        change(&h, 0, "blockAdd", "Bob").await?;
        let id = h.create(0, "Blocking", json!({})).await?;
        ensure!(refused(&h, 1, "tableJoin", id).await? == "You cannot join this table.");
        ensure!(refused(&h, 1, "tableSpectate", id).await? == "You cannot spectate this table.");
        h.send(2, "tableJoin", json!({"tableId":id})).await?;

        // Carol blocks Alice after sitting down; she can still return to her own seat.
        change(&h, 2, "blockAdd", "Alice").await?;
        h.send(2, "tableReattend", json!({"tableId":id})).await?;
        h.send(0, "tableStart", json!({"tableId":id})).await?;
        ensure!(refused(&h, 1, "tableSpectate", id).await? == "You cannot spectate this table.");

        // The block applies whoever made it: Alice cannot join a replay that Bob leads.
        let replay = h.replay(1).await?;
        ensure!(refused(&h, 0, "tableSpectate", replay).await? == "You cannot join this replay.");

        // Unblocking takes effect for both sessions right away.
        change(&h, 0, "blockRemove", "Bob").await?;
        h.send(0, "tableSpectate", json!({"tableId":replay}))
            .await?;
        h.send(1, "tableSpectate", json!({"tableId":id})).await?;
        Ok(())
    }
    .await;
    h.close().await?;
    outcome
}

#[tokio::test]
async fn spectators_return_to_their_tables_after_reconnecting() -> Result<()> {
    let Some(mut h) =
        Harness::new(&["Alice", "Bob", "Carol", "Dave", "Erin", "Frank", "Grace"]).await?
    else {
        return Ok(());
    };
    let outcome = async {
        let game = h.create(0, "Spectated game", json!({})).await?;
        h.send(1, "tableJoin", json!({"tableId":game})).await?;
        h.send(0, "tableStart", json!({"tableId":game})).await?;
        h.send(2, "tableSpectate", json!({"tableId":game,"shadowingPlayerIndex":1}))
            .await?;
        let replay = h.replay(3).await?;
        h.send(4, "tableSpectate", json!({"tableId":replay})).await?;
        let pregame = h.create(5, "Spectated pregame", json!({})).await?;
        h.send(6, "tableSpectate", json!({"tableId":replay})).await?;
        h.send(6, "tableSpectate", json!({"tableId":pregame})).await?;

        // Carol shadows seat 1 of the ongoing game; Erin watches Dave's shared replay; Grace
        // watches Frank's pregame, and is still listed at the replay that she watched before.
        for restarted in [false, true] {
            if restarted {
                h.restart().await?;
            } else {
                for index in [2, 4, 6] {
                    h.replace(index).await?;
                }
            }
            for (index, table, spectating, rejoined) in [
                (
                    2,
                    game,
                    json!([{"tableId":game,"shadowingPlayerIndex":1}]),
                    "tableStarted",
                ),
                (4, replay, json!([{"tableId":replay}]), "tableStarted"),
                (
                    6,
                    pregame,
                    json!([{"tableId":pregame},{"tableId":replay}]),
                    "tableJoined",
                ),
            ] {
                let welcome = h.receive(index, "welcome").await?;
                ensure!(
                    welcome["spectatingAtTables"] == spectating,
                    "A spectator was not sent back to their table (restarted: {restarted}): {welcome}"
                );
                // The client spectates the newest table it was told about.
                h.send(index, "tableSpectate", spectating[0].clone()).await?;
                ensure!(
                    h.receive(index, rejoined).await?["tableId"] == json!(table),
                    "A spectator did not rejoin their table (restarted: {restarted})"
                );
            }
        }
        Ok(())
    }
    .await;
    h.close().await?;
    outcome
}

#[tokio::test]
async fn default_table_names_keep_the_creator_and_remain_editable() -> Result<()> {
    let names = ["Alice", "Ren\u{e9}"];
    let Some(mut h) = Harness::new(&names).await? else {
        return Ok(());
    };
    let outcome = async {
        for (index, name) in names.iter().enumerate() {
            let expected = format!("{name}{}", hanabi_protocol::DEFAULT_TABLE_NAME_SUFFIX);
            let id = h.create(index, &expected, json!({})).await?;
            ensure!(
                h.snapshot(id).await?.0.name == expected,
                "Incorrect default table name"
            );
            h.send(
                index,
                "tableUpdate",
                json!({"tableId": id, "settings": {"name": expected}}),
            )
            .await?;
            ensure!(
                h.snapshot(id).await?.0.name == expected,
                "Editing changed the table name"
            );
        }
        Ok(())
    }
    .await;
    h.close().await?;
    outcome
}

#[tokio::test]
async fn expired_pregame_owner_is_removed_but_remaining_players_and_live_games_survive()
-> Result<()> {
    let Some(h) = Harness::new(&["Alice", "Bob", "Carol", "Observer"]).await? else {
        return Ok(());
    };
    let outcome = async {
        let id = h.store.allocate_table().await?;
        let mut table = tests::pregame(id);
        if let Phase::Pregame { players, .. } = &mut table.phase {
            for user in &h.users[1..3] {
                players.push(Player {
                    id: Some(user.user),
                    name: user.name.clone(),
                    bot: false,
                    stats: crate::stats::zero_stats(),
                });
            }
        }
        let revision = h.store.save_at(&table, 0).await?;
        let capacity = Arc::new(Semaphore::new(1));
        let (hub, mut notifications) = mpsc::channel(64);
        let saved = h.store.saved_at(table.id, revision).await?;
        let mut actor = TableActor::new(
            table,
            saved,
            h.store.clone(),
            hub,
            capacity.try_acquire_owned()?,
            crate::server_info::test_info(),
        );
        for user in &h.users[..3] {
            actor.initialize(user.clone(), vec![]).await?;
        }
        actor
            .reattend(
                h.users[3].clone(),
                &BTreeSet::new(),
                true,
                PlayerIndex::new(1),
            )
            .await?;
        while notifications.try_recv().is_ok() {}
        h.users[0].cancel.cancel();
        let now = Instant::now();
        actor.cleanup(now).await?;
        actor.cleanup(now + PREGAME_RECONNECT_GRACE).await?;
        let (restored, _) = h.snapshot(id).await?;
        ensure!(
            restored.seated_users().collect::<Vec<_>>() == vec![UserId(2), UserId(3)],
            "Disconnected owner kept a pregame seat"
        );
        ensure!(
            restored.owner == UserId(2),
            "Ownership did not pass to a remaining player"
        );
        ensure!(
            restored.shadows.get(&UserId(4)) == Some(&PlayerIndex::new(0)),
            "Departure changed the spectator's shadow target"
        );
        let mut published_owner = false;
        while let Ok(notification) = notifications.try_recv() {
            if let HubCommand::Effects(effects) = notification {
                for (session, message) in effects.messages {
                    ensure!(
                        !message.starts_with("connected "),
                        "A pregame sent which players loaded the game: {message}"
                    );
                    if session.user == UserId(2)
                        && let Some(body) = message.strip_prefix("pregame ")
                    {
                        let game: Value = serde_json::from_str(body)?;
                        published_owner |= game["ownerId"] == 2
                            && game["players"].as_array().is_some_and(|p| p.len() == 2);
                    }
                }
            }
        }
        ensure!(
            published_owner,
            "Remaining clients did not receive the updated pregame"
        );
        actor.start(h.users[1].clone()).await?;
        for user in &h.users {
            user.cancel.cancel();
        }
        actor.cleanup(now + PREGAME_RECONNECT_GRACE * 3).await?;
        let (ongoing, _) = h.snapshot(id).await?;
        ensure!(
            !actor.retired && matches!(ongoing.phase, Phase::Live { .. }),
            "Disconnect cleanup deleted an ongoing game"
        );
        Ok(())
    }
    .await;
    h.close().await?;
    outcome
}

#[tokio::test]
async fn remade_tables_publish_fresh_statistics_for_every_player() -> Result<()> {
    let Some(mut h) = Harness::new(&["Alice", "Bob", "Observer"]).await? else {
        return Ok(());
    };
    let outcome = async {
        let id = h.create(0, "Fresh restart statistics", json!({})).await?;
        h.send(1, "tableJoin", json!({"tableId":id})).await?;
        h.send(0, "tableStart", json!({"tableId":id})).await?;
        h.send(2, "tableSpectate", json!({"tableId":id})).await?;
        for index in 0..3 {
            h.send(index, "loaded", json!({"tableId":id})).await?;
        }
        let mut lock = h.store.primary.begin().await?;
        crate::store::advisory_lock(&mut lock, crate::store::LockSpace::VariantStats, 0).await?;
        let score = loop {
            let (table, _) = h.snapshot(id).await?;
            let snapshot = table.game().context("Missing game")?;
            let game = &snapshot.game;
            if game.end.is_some() {
                ensure!(game.score > 0, "Expected an improved personal best");
                break game.score;
            }
            ensure!(game.turn < 150, "Game did not reach its final round");
            let active = game.active_player_index;
            let hand = &game.players[active].hand;
            let playable = hand.iter().find(|&&order| {
                let card = &game.deck[order];
                card.rank
                    == game.stacks[card.suit_index]
                        .map_or(hanabi_protocol::MIN_RANK, |rank| rank + 1)
            });
            let action = if let Some(order) = playable {
                json!({"tableId":id,"action":{"type":"play","order":order}})
            } else if game.clue_tokens == 8 {
                let target = 1 - active;
                let card = &game.deck[game.players[target].hand[0]];
                json!({"tableId":id,"action":{"type":"clue","receiverIndex":target,"clue":{"type":"rank","value":card.rank}}})
            } else {
                json!({"tableId":id,"action":{"type":"discard","order":hand[0]}})
            };
            let actor = usize::try_from(snapshot.players[active].user()?.0)? - 1;
            h.send(actor, "playerAction", action).await?;
            for index in 0..3 {
                h.frames(index)?;
            }
        };
        for index in 0..3 {
            h.barrier(index).await?;
            h.frames(index)?;
        }
        let mut pending = h
            .begin(0, "tableRestart", json!({"tableId":id,"hidePregame":false}))
            .await?;
        ensure!(
            tokio::time::timeout(Duration::from_millis(50), &mut pending)
                .await
                .is_err(),
            "Remake finished while statistics were blocked"
        );
        // Release the delayed completion refresh only after the remake is requested.
        lock.rollback().await?;
        pending.await??;
        let mut remade = TableId(0);
        for index in 0..3 {
            let frame = h.receive(index, "pregame").await?;
            remade = TableId(frame["tableId"].as_u64().context("Missing remade table")?);
            let players = frame["players"].as_array().context("Missing players")?;
            ensure!(players.len() == 2, "Spectator became a player");
            for player in players {
                ensure!(
                    player["stats"]["numGames"] == 1
                        && player["stats"]["variant"]["numGames"] == 1
                        && player["stats"]["variant"]["bestScores"][0]["best"]["score"] == score,
                    "Remade table published stale player statistics: {player}"
                );
            }
        }
        let (saved, _) = h.snapshot(remade).await?;
        for player in saved.players() {
            ensure!(
                player.stats.variant.best_scores[0].best.as_ref().map(|best| best.score)
                    == Some(hanabi_protocol::Score(score)),
                "Fresh statistics were not persisted"
            );
        }
        Ok::<(), anyhow::Error>(())
    }
    .await;
    h.close().await?;
    outcome
}

#[tokio::test]
async fn chat_read_positions_survive_game_start_reconnect_and_remake() -> Result<()> {
    let Some(mut h) = Harness::new(&["Alice", "Bob"]).await? else {
        return Ok(());
    };
    let result = async {
        let id = h.create(0, "Read history", json!({})).await?;
        h.send(1, "tableJoin", json!({"tableId":id})).await?;
        h.send(1, "chatRead", json!({"tableId":id})).await?;
        let bob_read = h.snapshot(id).await?.0.chat.len();
        h.send(0, "chat", json!({"tableId":id,"text":"One unread message"}))
            .await?;
        h.send(0, "chatRead", json!({"tableId":id})).await?;
        let alice_read = h.snapshot(id).await?.0.chat.len();
        h.send(0, "tableStart", json!({"tableId":id})).await?;
        for index in 0..2 {
            h.barrier(index).await?;
            h.frames(index)?;
            h.send(index, "tableReattend", json!({"tableId":id}))
                .await?;
            h.send(index, "gameStateLoad", json!({"tableId":id}))
                .await?;
            let history = h.receive(index, "chatList").await?;
            ensure!(
                history["unread"] == i32::from(index != 0),
                "Game start reset the chat read position: {history}"
            );
            h.send(index, "loaded", json!({"tableId":id})).await?;
        }
        h.send(1, "tableUnattend", json!({"tableId":id})).await?;
        h.replace(1).await?;
        h.send(1, "tableReattend", json!({"tableId":id})).await?;
        h.send(1, "gameStateLoad", json!({"tableId":id})).await?;
        ensure!(
            h.receive(1, "chatList").await?["unread"] == 1,
            "Reconnect reset the chat read position"
        );
        h.send(1, "loaded", json!({"tableId":id})).await?;
        h.send(0, "tableTerminate", json!({"tableId":id})).await?;
        for index in 0..2 {
            h.barrier(index).await?;
            h.frames(index)?;
        }
        h.send(0, "tableRestart", json!({"tableId":id,"hidePregame":true}))
            .await?;
        let started = h.receive(0, "tableStarted").await?;
        let remade = started["tableId"]
            .as_u64()
            .map(TableId)
            .context("Missing remade table")?;
        // A restart keeps the table, and with a hidden pregame starts the next game at once.
        ensure!(remade == id, "The restart moved to table {remade}");
        for (index, read) in [alice_read, bob_read].into_iter().enumerate() {
            h.replace(index).await?;
            h.send(index, "tableReattend", json!({"tableId":remade}))
                .await?;
            h.send(index, "gameStateLoad", json!({"tableId":remade}))
                .await?;
            let history = h.receive(index, "chatList").await?;
            let total = history["messages"]
                .as_array()
                .context("Missing history")?
                .len();
            ensure!(
                history["unread"] == total - read,
                "Remake reset the chat read position: {history}"
            );
        }
        Ok::<(), anyhow::Error>(())
    }
    .await;
    let cleanup = h.close().await;
    result?;
    cleanup
}

#[tokio::test]
async fn restart_leaves_out_players_who_are_done_playing() -> Result<()> {
    let Some(mut h) = Harness::new(&["Alice", "Bob", "Carol"]).await? else {
        return Ok(());
    };
    let result = async {
        let id = h.create(0, "Done playing", json!({})).await?;
        for index in 1..3 {
            h.send(index, "tableJoin", json!({"tableId":id})).await?;
        }
        h.send(0, "tableStart", json!({"tableId":id})).await?;
        for index in 0..3 {
            h.send(index, "loaded", json!({"tableId":id})).await?;
        }
        h.send(0, "tableTerminate", json!({"tableId":id})).await?;
        for index in 0..3 {
            h.barrier(index).await?;
            h.frames(index)?;
        }
        h.send(
            2,
            "tableRestartDecline",
            json!({"tableId":id,"declined":true}),
        )
        .await?;
        for index in 0..3 {
            let declined = h.receive(index, "restartDeclined").await?;
            ensure!(
                declined["restartDeclined"] == json!(["Carol"]),
                "{declined}"
            );
        }
        h.send(2, "gameInitLoad", json!({"tableId":id})).await?;
        let init = h.receive(2, "init").await?;
        ensure!(
            init["mode"]["sharedReplay"]["restartDeclined"] == json!(["Carol"])
                && init["mode"]["sharedReplay"]["canPlayAgain"] == true,
            "{init}"
        );
        ensure!(
            h.send(0, "tableRestart", json!({"tableId":id,"hidePregame":true}))
                .await
                .is_err(),
            "Restarted the game without a player who is done playing"
        );
        h.send(0, "tableRestart", json!({"tableId":id,"hidePregame":false}))
            .await?;
        let remade = h.receive(0, "pregame").await?;
        let mut players = remade["players"]
            .as_array()
            .context("Missing players")?
            .iter()
            .filter_map(|p| p["username"].as_str())
            .collect::<Vec<_>>();
        players.sort_unstable();
        ensure!(players == ["Alice", "Bob"], "{remade}");
        // Everyone stays at the table: they leave the replay, then join its next pregame. Carol
        // watches it as a spectator.
        for index in 1..3 {
            let frames = h.frames(index)?;
            let position = |name: &str| frames.iter().position(|(command, _)| command == name);
            ensure!(
                position("tableBooted") < position("tableJoined")
                    && position("tableJoined").is_some(),
                "Did not move from the replay to the pregame: {frames:?}"
            );
            ensure!(frames.iter().any(
                    |(command, data)| command == "tableJoined" && data["tableId"] == json!(id)
                ));
            if index == 2 {
                ensure!(
                    frames.iter().any(|(command, data)| command == "spectators"
                        && data["spectators"][0]["username"] == "Carol"),
                    "Carol is not spectating"
                );
            }
        }
        let table = h.snapshot(id).await?.0;
        ensure!(
            matches!(table.phase, Phase::Pregame { .. }) && table.name == "Done playing (#2)",
            "The table did not become the next game's pregame"
        );
        Ok::<(), anyhow::Error>(())
    }
    .await;
    let cleanup = h.close().await;
    result?;
    cleanup
}

#[tokio::test]
async fn pregame_announces_spectators() -> Result<()> {
    let Some(mut h) = Harness::new(&["Alice", "Bob"]).await? else {
        return Ok(());
    };
    let result = async {
        let id = h.create(0, "Spectator notices", json!({})).await?;
        h.send(1, "tableSpectate", json!({"tableId":id})).await?;
        let history = h.receive(1, "chatList").await?;
        ensure!(history["messages"][1]["text"] == "Bob joined the game (as a spectator).");
        h.send(1, "tableSpectate", json!({"tableId":id})).await?;
        h.send(1, "tableUnattend", json!({"tableId":id})).await?;
        let notices = chat_messages(&h.frames(0)?)
            .into_iter()
            .map(|m| m["text"].clone())
            .collect::<Vec<_>>();
        ensure!(
            notices
                == [
                    "Bob joined the game (as a spectator).",
                    "Bob left the game (as a spectator).",
                ],
            "{notices:?}"
        );
        Ok::<(), anyhow::Error>(())
    }
    .await;
    let cleanup = h.close().await;
    result?;
    cleanup
}

#[tokio::test]
async fn spectators_can_join_after_leaving_a_pregame_they_returned_to_the_lobby_from() -> Result<()>
{
    let Some(mut h) = Harness::new(&["Alice", "Bob"]).await? else {
        return Ok(());
    };
    let result = async {
        let old = h.create(1, "Old", json!({})).await?;
        h.send(1, "tableUnattend", json!({"tableId":old})).await?;
        let new = h.create(0, "New", json!({})).await?;
        h.send(1, "tableSpectate", json!({"tableId":new})).await?;
        // The "Join Game" button leaves the other table first.
        h.send(1, "tableLeave", json!({"tableId":old})).await?;
        h.send(1, "tableJoin", json!({"tableId":new})).await?;
        let (table, _) = h.snapshot(new).await?;
        ensure!(
            table
                .players()
                .iter()
                .map(|p| p.name.as_str())
                .collect::<Vec<_>>()
                == ["Alice", "Bob"],
            "Bob did not join the new table"
        );
        Ok::<(), anyhow::Error>(())
    }
    .await;
    let cleanup = h.close().await;
    result?;
    cleanup
}

#[tokio::test]
async fn pregame_history_survives_join_return_and_actor_recovery() -> Result<()> {
    let Some(mut h) = Harness::new(&["Alice", "Bob", "Outsider"]).await? else {
        return Ok(());
    };
    let result = async {
        let id = h.create(0, "Chat recovery", json!({})).await?;
        h.send(0, "tableUnattend", json!({"tableId":id})).await?;
        h.send(0, "tableReattend", json!({"tableId":id})).await?;
        let history = h.receive(0, "chatList").await?;
        ensure!(history["messages"][0]["text"] == "Alice created the table.");
        ensure!(history["messages"][0]["source"] == "server");
        ensure!(
            history["unread"] == 0,
            "The creator has unread chat: {history}"
        );
        h.send(0, "chat", json!({"tableId":id,"text":"Before Bob joined"}))
            .await?;
        h.send(1, "tableJoin", json!({"tableId":id})).await?;
        let history = h.receive(1, "chatList").await?;
        ensure!(history["messages"][1]["text"] == "Before Bob joined");
        ensure!(history["messages"][2]["text"] == "Bob joined the game.");
        ensure!(history["messages"][2]["source"] == "server");
        ensure!(
            chat_messages(&h.frames(0)?)
                .iter()
                .any(|m| m["text"] == "Bob joined the game.")
        );
        h.send(1, "chat", json!({"tableId":id,"text":"Bob's message"}))
            .await?;
        h.send(1, "tableUnattend", json!({"tableId":id})).await?;
        h.frames(1)?;
        h.send(0, "chat", json!({"tableId":id,"text":"While Bob was away"}))
            .await?;
        h.send(1, "tableReattend", json!({"tableId":id})).await?;
        let history = h.receive(1, "chatList").await?;
        ensure!(history["messages"].as_array().unwrap().len() == 5);
        ensure!(history["messages"][4]["text"] == "While Bob was away");
        h.send(1, "tableLeave", json!({"tableId":id})).await?;
        h.send(1, "tableJoin", json!({"tableId":id})).await?;
        let history = h.receive(1, "chatList").await?;
        ensure!(history["messages"][5]["text"] == "Bob left the game.");
        ensure!(history["messages"][6]["text"] == "Bob joined the game.");
        ensure!(
            h.frames(2)?
                .iter()
                .all(|(name, _)| name != "chat" && name != "chatList"),
            "Table chat leaked to an outsider"
        );
        let snapshot = h.snapshot(id).await?.0;
        ensure!(snapshot.chat.len() == 7 && snapshot.chat.iter().all(|chat| chat.id.is_some()));
        let count: i64 = sqlx::query_scalar!(
            "SELECT count(*) AS \"v!\" FROM chat_log WHERE table_id=$1",
            i64::try_from(id.0)?
        )
        .fetch_one(&h.store.primary)
        .await?;
        ensure!(count == 7, "Pregame messages were not archived");
        h.restart().await?;
        h.send(0, "tableReattend", json!({"tableId":id})).await?;
        let restored = h.receive(0, "chatList").await?;
        ensure!(
            restored["messages"] == history["messages"],
            "Recovery changed pregame history"
        );
        Ok::<(), anyhow::Error>(())
    }
    .await;
    let cleanup = h.close().await;
    result?;
    cleanup
}

fn chat_messages(frames: &[(String, Value)]) -> Vec<Value> {
    frames
        .iter()
        .filter(|(name, _)| name == "chat")
        .map(|(_, data)| data.clone())
        .collect()
}

#[tokio::test]
async fn pregame_leader_moves_to_first_seat_without_reordering_live_players() -> Result<()> {
    let Some(mut h) = Harness::new(&["Alice", "Bob", "Carol"]).await? else {
        return Ok(());
    };
    let result = async {
        let id = h.create(0, "Leader seating", json!({})).await?;
        for index in 1..3 {
            h.send(index, "tableJoin", json!({"tableId":id})).await?;
        }
        h.barrier(0).await?;
        for index in 0..3 {
            h.frames(index)?;
        }
        h.send(0, "tableSetOwner", json!({"tableId":id,"ownerId":3}))
            .await?;
        for index in 0..3 {
            let game = h.receive(index, "pregame").await?;
            ensure!(game["ownerId"] == 3);
            let players = game["players"].as_array().context("Missing players")?;
            for (seat, name) in ["Carol", "Bob", "Alice"].iter().enumerate() {
                ensure!(
                    players[seat]["username"] == *name,
                    "Leader transfer did not swap the new leader into the first seat"
                );
            }
        }
        let expected = vec![UserId(3), UserId(2), UserId(1)];
        ensure!(
            h.snapshot(id).await?.0.seated_users().collect::<Vec<_>>() == expected,
            "Leader seating was not persisted"
        );
        h.send(2, "tableStart", json!({"tableId":id})).await?;
        let live_players = h.snapshot(id).await?.0.seated_users().collect::<Vec<_>>();
        h.send(2, "tableSetOwner", json!({"tableId":id,"ownerId":1}))
            .await?;
        let table = h.snapshot(id).await?.0;
        ensure!(table.owner == UserId(1));
        ensure!(
            table.seated_users().collect::<Vec<_>>() == live_players,
            "Changing a live game's leader changed the seats"
        );
        Ok::<(), anyhow::Error>(())
    }
    .await;
    let cleanup = h.close().await;
    result?;
    cleanup
}

#[tokio::test]
async fn a_replay_whose_leader_is_away_passes_leadership_to_the_first_to_return() -> Result<()> {
    let Some(mut h) = Harness::new(&["Alice", "Bob"]).await? else {
        return Ok(());
    };
    let result = async {
        let id = h.replay(0).await?;
        h.send(1, "tableSpectate", json!({"tableId":id})).await?;
        // After a restart, the table has no one at it until its viewers return.
        h.restart().await?;
        h.send(1, "tableReattend", json!({"tableId":id})).await?;
        h.send(1, "gameInitLoad", json!({"tableId":id})).await?;
        let init = h.receive(1, "init").await?;
        ensure!(
            init["mode"]["sharedReplay"]["ownerId"] == 2,
            "The returning viewer did not lead the replay: {init}"
        );
        ensure!(h.snapshot(id).await?.0.owner == UserId(2));
        // Alice returns to a replay that Bob now leads.
        h.send(0, "tableReattend", json!({"tableId":id})).await?;
        h.send(0, "gameInitLoad", json!({"tableId":id})).await?;
        let init = h.receive(0, "init").await?;
        ensure!(init["mode"]["sharedReplay"]["ownerId"] == 2);
        Ok::<(), anyhow::Error>(())
    }
    .await;
    let cleanup = h.close().await;
    result?;
    cleanup
}

#[tokio::test]
async fn finished_game_publishes_replay_leader_candidates_without_reconnecting() -> Result<()> {
    let Some(mut h) = Harness::new(&["Alice", "Bob", "Observer", "Outsider"]).await? else {
        return Ok(());
    };
    let result = async {
        let id = h.create(0, "Leader candidates", json!({})).await?;
        h.send(1, "tableJoin", json!({"tableId":id})).await?;
        h.send(0, "tableStart", json!({"tableId":id})).await?;
        h.send(2, "tableSpectate", json!({"tableId":id})).await?;
        for index in 0..3 {
            h.send(index, "loaded", json!({"tableId":id})).await?;
        }
        h.barrier(0).await?;
        for index in 0..4 {
            h.frames(index)?;
        }
        h.send(0, "tableTerminate", json!({"tableId":id})).await?;
        for index in 0..3 {
            ensure!(
                h.receive(index, "connected").await?["connected"] == json!([true, true]),
                "Finished-game names must not be shown as disconnected"
            );
            let roster = h.receive(index, "spectators").await?;
            let names = roster["spectators"]
                .as_array()
                .context("Missing roster")?
                .iter()
                .map(|p| p["username"].as_str().unwrap())
                .collect::<BTreeSet<_>>();
            ensure!(
                names == BTreeSet::from(["Alice", "Bob", "Observer"]),
                "Finished-game players were missing from replay leader candidates"
            );
            let clock = h.receive(index, "clock").await?;
            ensure!(
                clock.get("currentPlayerIndex").is_none() && clock["turnElapsedMs"] == 0,
                "Completion did not stop the active clock"
            );
        }
        ensure!(
            h.frames(3)?.iter().all(|(name, _)| name != "spectators"),
            "Replay roster was sent to a non-attendee"
        );
        h.send(0, "tableSetOwner", json!({"tableId":id,"ownerId":2}))
            .await?;
        ensure!(h.receive(0, "tableOwner").await?["ownerId"] == 2);
        ensure!(h.snapshot(id).await?.0.owner == UserId(2));
        h.send(2, "tableUnattend", json!({"tableId":id})).await?;
        let roster = h.receive(0, "spectators").await?;
        ensure!(roster["spectators"].as_array().unwrap().len() == 2);
        ensure!(
            roster["spectators"]
                .as_array()
                .unwrap()
                .iter()
                .all(|p| p["username"] != "Observer"),
            "Departed attendee remained a leader candidate"
        );
        Ok::<(), anyhow::Error>(())
    }
    .await;
    let cleanup = h.close().await;
    result?;
    cleanup
}

#[tokio::test]
async fn replay_loading_keeps_names_neutral_and_never_starts_a_game_clock() -> Result<()> {
    let Some(mut h) = Harness::new(&["Alice", "Bob"]).await? else {
        return Ok(());
    };
    let result = async {
        let id = h.replay(0).await?;
        let initial = h.snapshot(id).await?.0;
        h.barrier(0).await?;
        h.frames(0)?;
        h.send(0, "loaded", json!({"tableId":id})).await?;
        ensure!(h.receive(0, "connected").await?["connected"] == json!([true, true]));
        h.barrier(0).await?;
        ensure!(h.frames(0)?.iter().all(|(command, _)| command != "clock"));
        tokio::time::sleep(Duration::from_millis(25)).await;
        h.send(
            0,
            "replayAction",
            json!({"tableId":id,"action":{"type":"turn","turn":0}}),
        )
        .await?;
        let snapshot = h.snapshot(id).await?.0;
        let replay = snapshot.game().unwrap();
        let before = initial.game().unwrap();
        ensure!(!replay.timer_started);
        ensure!(
            replay.clocks == before.clocks
                && replay.turn_elapsed == before.turn_elapsed
                && replay.duration == before.duration,
            "Replay navigation advanced game clocks"
        );
        h.send(1, "tableSpectate", json!({"tableId":id})).await?;
        h.send(1, "gameStateLoad", json!({"tableId":id})).await?;
        ensure!(h.receive(1, "connected").await?["connected"] == json!([true, true]));
        h.send(1, "loaded", json!({"tableId":id})).await?;
        h.barrier(0).await?;
        for index in 0..2 {
            let frames = h.frames(index)?;
            ensure!(
                frames.iter().all(|(command, _)| command != "clock"),
                "Loading another replay viewer sent a live clock"
            );
            for (_, data) in frames.iter().filter(|(command, _)| command == "connected") {
                ensure!(data["connected"] == json!([true, true]));
            }
        }
        Ok::<(), anyhow::Error>(())
    }
    .await;
    let cleanup = h.close().await;
    result?;
    cleanup
}

/// Browsers send whole numbers such as `0.0` as `0`, as `JSON.stringify` does.
#[expect(
    clippy::cast_possible_truncation,
    reason = "only whole floats are converted"
)]
fn browser_json(value: Value) -> Value {
    match value {
        Value::Number(n) if n.as_f64().is_some_and(|f| f % 1.0 == 0.0) && !n.is_i64() => {
            json!(n.as_f64().unwrap() as i64)
        }
        Value::Array(items) => Value::Array(items.into_iter().map(browser_json).collect()),
        Value::Object(map) => {
            Value::Object(map.into_iter().map(|(k, v)| (k, browser_json(v))).collect())
        }
        other => other,
    }
}

fn suggestion(value: &Value) -> Result<Value> {
    value
        .get("suggestedSettings")
        .cloned()
        .context("Missing actionable suggestion")
}
async fn mark_complete(h: &Harness, user: i32, except: Option<&str>) -> Result<()> {
    let variants = hanabi_engine::variants()
        .iter()
        .filter(|v| Some(v.name.as_str()) != except)
        .collect::<Vec<_>>();
    sqlx::query!("INSERT INTO user_stats(user_id,variant_id,best_score2,best_score2_mod) SELECT $1,v.id,v.score,0 FROM UNNEST($2::smallint[],$3::smallint[]) AS v(id,score) ON CONFLICT(user_id,variant_id) DO UPDATE SET best_score2=excluded.best_score2,best_score2_mod=0", user, &variants.iter().map(|v|i16::try_from(v.id)).collect::<Result<Vec<_>,_>>()?, &variants.iter().map(|v|i16::try_from(v.max_score)).collect::<Result<Vec<_>,_>>()?).execute(&h.store.primary).await?;
    Ok(())
}

#[tokio::test]
async fn pregame_total_counts_only_normal_non_speedrun_games() -> Result<()> {
    let Some(mut h) = Harness::new(&["Alice", "Bob"]).await? else {
        return Ok(());
    };
    let outcome = async {
        let games: Vec<i32> = sqlx::query_scalar!("INSERT INTO games(name,num_players,variant_id,timed,time_base,time_per_turn,
             speedrun,deck_plays,empty_clues,one_extra_card,one_less_card,
             all_or_nothing,detrimental_characters,seed,score,num_turns,end_condition,datetime_started,datetime_finished)
             SELECT 'Stats fixture',2,CASE WHEN n=2 THEN 1 ELSE 0 END,false,NULL,NULL,
             n IN (8,9),false,false,false,false,false,false,
             'stats-'||n,CASE WHEN n IN (1,8) THEN 25 ELSE 0 END,30,
             CASE n WHEN 3 THEN 2 WHEN 4 THEN 3 WHEN 5 THEN 4 WHEN 6 THEN 6
                    WHEN 7 THEN 10 WHEN 9 THEN 5 ELSE 1 END,NOW(),NOW()
             FROM generate_series(1,9) n ORDER BY n RETURNING id")
        .fetch_all(&h.store.primary)
        .await?;
        sqlx::query!("INSERT INTO game_participants(game_id,user_id,seat)
             SELECT id,1,0 FROM unnest($1::integer[]) games(id)", &games)
        .execute(&h.store.primary)
        .await?;
        let id = h.create(0, "Count parity", json!({})).await?;
        h.send(1, "tableJoin", json!({"tableId":id})).await?;
        let snapshot = h.snapshot(id).await?.0;
        let players = snapshot.players();
        ensure!(
            players.iter().find(|player| player.is(UserId(1))).context("Missing Alice")?.stats.num_games == hanabi_protocol::Count(2),
            "Pregame total must count normal non-speedrun games across variants, including zero-score normal finishes"
        );
        ensure!(
            players.iter().find(|player| player.is(UserId(2))).context("Missing Bob")?.stats.num_games == hanabi_protocol::Count(0),
            "Another player's history must not affect the total"
        );
        ensure!(
            crate::database::normal_game_count(&h.store.primary, UserId(1), true).await? == 3,
            "Welcome/history totals must also include normally completed speedruns"
        );
        Ok::<(), anyhow::Error>(())
    }
    .await;
    let cleanup = h.close().await;
    outcome?;
    cleanup
}

#[tokio::test]
async fn unknown_table_commands_are_persisted_and_delivered_to_bots() -> Result<()> {
    let Some(mut h) = Harness::new(&["Bot", "Alice", "Outsider"]).await? else {
        return Ok(());
    };
    let outcome = async {
        let id = h.create(0, "Bot table", json!({})).await?;
        h.send(1, "tableJoin", json!({"tableId":id})).await?;
        for running in [false, true] {
            if running {
                h.send(0, "tableStart", json!({"tableId":id})).await?;
                ensure!(matches!(h.snapshot(id).await?.0.phase, Phase::Live { .. }));
            }
            h.frames(0)?;
            h.frames(2)?;
            for (text, expected) in [
                ("/setall 11", "/setall 11"),
                ("/custom-bot <level>", "/custom-bot &lt;level&gt;"),
            ] {
                let before = h.snapshot(id).await?.0.chat.len();
                h.send(1, "chat", json!({"tableId":id,"text":text})).await?;
                let messages = chat_messages(&h.frames(0)?);
                ensure!(
                    messages.iter().any(|message| message["text"] == expected
                        && message["username"] == "Alice"
                        && message["source"] == "user"),
                    "Bot did not receive table command"
                );
                let snapshot = h.snapshot(id).await?.0;
                ensure!(
                    snapshot.chat.len() == before + 1,
                    "Command was not persisted"
                );
                ensure!(snapshot.chat[before].message.text == expected);
                ensure!(
                    chat_messages(&h.frames(2)?).is_empty(),
                    "Outsider received chat"
                );
            }
        }
        Ok::<(), anyhow::Error>(())
    }
    .await;
    let cleanup = h.close().await;
    outcome?;
    cleanup
}

#[tokio::test]
async fn option_proposals_publish_changed_values_but_keep_apply_button_private() -> Result<()> {
    let Some(mut h) = Harness::new(&["Alice", "Bob<&>", "Carol", "Outsider"]).await? else {
        return Ok(());
    };
    let result = async {
        let id = h.create(0, "Original", json!({})).await?;
        for index in 1..3 {
            h.send(index, "tableJoin", json!({"tableId":id})).await?;
        }
        h.barrier(0).await?;
        for index in 0..4 {
            h.frames(index)?;
        }
        h.send(1, "tableUpdate", json!({
            "tableId":id,"settings":{"name":"Proposal","maxPlayers":2,
            "options":{"variantName":"6 Suits","timeControl":{"baseSeconds":120,"perTurnSeconds":20},"emptyClues":true}}
        })).await?;
        h.barrier(0).await?;
        for index in 0..3 {
            let messages = chat_messages(&h.frames(index)?);
            let summary = messages.iter().find(|m| m.get("recipient").is_none()).context("Missing public summary")?;
            let text = summary["text"].as_str().context("Missing summary text")?;
            for expected in ["Bob&lt;&amp;&gt; proposes the following options:", "Table Name: <b>Proposal</b>", "Variant: <b>6 Suits</b>", "Timed: <b>120 / 20</b>", "Max Players: <b>2</b>", "Empty Clues: <b>Yes</b>", "Players above the new limit will be removed."] {
                ensure!(text.contains(expected), "Missing proposal detail: {expected}");
            }
            ensure!(!text.contains("Speedrun:") && !text.contains("Bottom-Deck:"));
            let button = messages.iter().find(|m| m["text"].as_str().is_some_and(|s| s.contains("new-options")));
            if index == 0 {
                let button = button.context("Owner is missing the apply button")?;
                ensure!(button["recipient"] == "Alice");
                let suggestion = suggestion(button)?;
                ensure!(suggestion["options"]["variantName"] == "6 Suits" && suggestion["maxPlayers"] == 2 && suggestion["name"] == "Proposal");
            } else {
                ensure!(button.is_none(), "Apply button leaked to a non-owner");
            }
        }
        ensure!(chat_messages(&h.frames(3)?).is_empty());
        let table = h.snapshot(id).await?.0;
        ensure!(table.options.variant_name == "No Variant" && table.name == "Original" && table.max_players == 5);
        let message = &table.chat.last().context("Summary was not persisted")?.message;
        ensure!(message.text.contains("Variant: <b>6 Suits</b>"));
        ensure!(message.recipient.is_none());
        let before = table.chat.len();
        let error = h.send(1, "tableUpdate", json!({"tableId":id,"settings":{"name":"Original"}}))
            .await.expect_err("Unchanged options should be rejected");
        ensure!(error.to_string() == "There are no new options proposed.");
        ensure!(h.snapshot(id).await?.0.chat.len() == before);
        Ok::<(), anyhow::Error>(())
    }.await;
    let cleanup = h.close().await;
    result?;
    cleanup
}

#[tokio::test]
async fn players_cannot_fill_a_table_chat_and_block_the_owner() -> Result<()> {
    let Some(mut h) = Harness::new(&["Alice", "Bob"]).await? else {
        return Ok(());
    };
    let result = async {
        let id = h.create(0, "Original", json!({})).await?;
        h.send(1, "tableJoin", json!({"tableId":id})).await?;
        let proposal = json!({"tableId":id,"settings":{"name":"Proposal"}});
        // Proposals count like chat messages.
        for _ in 0..TABLE_CHAT_LIMIT {
            h.send(1, "tableUpdate", proposal.clone()).await?;
        }
        let refused = h
            .send(1, "tableUpdate", proposal.clone())
            .await
            .expect_err("A proposal past the chat limit was accepted");
        ensure!(refused.to_string().contains("too quickly"), "{refused:#}");

        // Fill the chat to its limit. Restarting also resets the rate limit.
        h.stop_hub().await?;
        let (mut table, revision) = h.snapshot(id).await?;
        let filler = chat::server_chat(id, "Filler");
        table
            .chat
            .resize_with(crate::model::MAX_TABLE_CHAT, || crate::model::TableChat {
                id: None,
                user: None,
                message: filler.clone(),
            });
        h.store.save_at(&table, revision).await?;
        h.start_hub().await?;
        for index in 0..2 {
            h.send(index, "tableReattend", json!({"tableId":id}))
                .await?;
        }

        for (command, data) in [
            ("chat", json!({"tableId":id,"text":"Hello"})),
            ("tableUpdate", proposal.clone()),
        ] {
            let refused = h
                .send(1, command, data)
                .await
                .expect_err("A player added to a full chat");
            ensure!(refused.to_string() == "Chat history is full", "{refused:#}");
        }
        // The owner's changes still apply, without their notices.
        h.send(
            0,
            "tableUpdate",
            json!({"tableId":id,"settings":{"name":"Changed"}}),
        )
        .await?;
        h.send(0, "tableSetOwner", json!({"tableId":id,"ownerId":2}))
            .await?;
        let table = h.snapshot(id).await?.0;
        ensure!(table.name == "Changed" && table.owner == h.users[1].user);
        ensure!(table.chat.len() == crate::model::MAX_TABLE_CHAT);
        Ok::<(), anyhow::Error>(())
    }
    .await;
    let cleanup = h.close().await;
    result?;
    cleanup
}

#[tokio::test]
async fn findvariant_delivers_owner_button_and_guards_the_start_action() -> Result<()> {
    let Some(mut h) = Harness::new(&["Alice", "Bob"]).await? else {
        return Ok(());
    };
    let outcome=async{
        mark_complete(&h,2,Some("Rainbow (5 Suits)")).await?;
        let id=h.create(0,"Team discovery",json!({"options":{"deckPlays":true,"oneExtraCard":true}})).await?;
        h.send(1,"tableJoin",json!({"tableId":id})).await?;h.barrier(0).await?;
        h.frames(0)?;h.frames(1)?;
        h.send(1,"chat",json!({"tableId":id,"text":"/findvariant"})).await?;h.barrier(0).await?;
        let alice=chat_messages(&h.frames(0)?);let bob=chat_messages(&h.frames(1)?);
        let proposal=alice.iter().find(|v|v["text"].as_str().is_some_and(|s|s.contains("new-options"))).context("Owner did not receive proposal")?;
        ensure!(proposal["recipient"]=="Alice","Proposal was not private");
        ensure!(!bob.iter().any(|v|v["text"].as_str().is_some_and(|s|s.contains("new-options"))),"Non-owner received proposal");
        ensure!(bob.iter().any(|v|v["text"]=="Here is a random variant that everyone needs the 2-player max score in: Rainbow (5 Suits)"),"Wrong team discovery result");
        let suggestion=browser_json(suggestion(proposal)?);let options=&suggestion["options"];
        ensure!(options["variantName"]=="Rainbow (5 Suits)"&&suggestion["name"]=="Team discovery"&&suggestion["maxPlayers"]==5&&options["deckPlays"]==true&&options["oneExtraCard"]==true,"Proposal lost table settings");
        let (table,_)=h.snapshot(id).await?;
        ensure!(table.chat.iter().all(|c|!c.message.text.contains("new-options")),"Private proposal entered public history");
        h.send(0,"tableUpdate",json!({"tableId":id,"settings":suggestion})).await?;
        let before=h.snapshot(id).await?.1;
        for data in [
            json!({"tableId":id,"intendedPlayerNames":["Alice","Cathy"]}),
            json!({"tableId":id,"intendedPlayerNames":["Alice"]}),
        ]{h.send(0,"tableStart",data).await?;ensure!(h.snapshot(id).await?.1==before,"Stale start intent mutated the game");}
        h.send(0,"tableStart",json!({"tableId":id,"intendedPlayerNames":["Bob","Alice"]})).await?;
        ensure!(matches!(h.snapshot(id).await?.0.phase,Phase::Live{..}),"Valid guarded start failed");
        Ok::<(),anyhow::Error>(())
    }.await;
    h.close().await?;
    outcome
}

#[tokio::test]
async fn findvariant_rechecks_roster_after_lookup_without_blocking_table_commands() -> Result<()> {
    let Some(mut h) = Harness::new(&["Alice", "Bob", "Cathy"]).await? else {
        return Ok(());
    };
    let outcome=async{
        mark_complete(&h,2,Some("Rainbow (5 Suits)")).await?;mark_complete(&h,3,None).await?;
        let id=h.create(0,"Changing team",json!({})).await?;
        h.send(1,"tableJoin",json!({"tableId":id})).await?;h.barrier(0).await?;
        for index in 0..3{h.frames(index)?;}
        let mut lock=h.store.primary.begin().await?;
        #[expect(clippy::disallowed_methods, reason = "test SQL that sets up database state or failures directly")]
        sqlx::query("LOCK TABLE user_stats IN ACCESS EXCLUSIVE MODE").execute(&mut *lock).await?;
        let finding=h.begin(1,"chat",json!({"tableId":id,"text":"/fv"})).await?;
        h.wait_locks(1).await?;
        h.send(0,"tableLeave",json!({"tableId":id})).await?;
        let joining=h.begin(2,"tableJoin",json!({"tableId":id})).await?;
        h.wait_locks(2).await?;lock.commit().await?;
        joining.await??;finding.await??;h.barrier(1).await?;
        let (table,_)=h.snapshot(id).await?;
        ensure!(table.seated_users().collect::<Vec<_>>()==vec![UserId(2),UserId(3)],"Concurrent roster change was blocked");
        for index in 0..3{
            let chats=chat_messages(&h.frames(index)?);
            ensure!(!chats.iter().any(|v|v["text"].as_str().unwrap_or("").contains("new-options")),"Stale roster received an actionable proposal");
            if index==1{ensure!(chats.iter().any(|v|v["text"]=="Here is a random variant that everyone needs the 2-player max score in: Rainbow (5 Suits)"),"Lookup did not preserve its captured team");}
        }
        Ok::<(),anyhow::Error>(())
    }.await;
    h.close().await?;
    outcome
}

#[tokio::test]
async fn findvariant_targets_only_the_current_owner_generation() -> Result<()> {
    let Some(mut h) = Harness::new(&["Alice", "Bob"]).await? else {
        return Ok(());
    };
    let outcome = async {
        mark_complete(&h, 2, Some("Rainbow (5 Suits)")).await?;
        let id = h.create(0, "Current owner", json!({})).await?;
        h.send(1, "tableJoin", json!({"tableId":id})).await?;
        h.barrier(0).await?;
        h.frames(0)?;
        h.frames(1)?;
        let mut lock = h.store.primary.begin().await?;
        #[expect(
            clippy::disallowed_methods,
            reason = "test SQL that sets up database state or failures directly"
        )]
        sqlx::query("LOCK TABLE user_stats IN ACCESS EXCLUSIVE MODE")
            .execute(&mut *lock)
            .await?;
        let finding = h
            .begin(1, "chat", json!({"tableId":id,"text":"/fv"}))
            .await?;
        h.wait_locks(1).await?;
        let (old, mut old_frames) = h.replace(0).await?;
        h.send(0, "tableReattend", json!({"tableId":id})).await?;
        lock.commit().await?;
        finding.await??;
        h.barrier(0).await?;
        ensure!(!old.active(), "Owner generation was not fenced");
        ensure!(
            chat_messages(&h.frames(0)?)
                .iter()
                .any(|v| v["recipient"] == "Alice"
                    && v["text"].as_str().unwrap_or("").contains("new-options")),
            "Current owner did not get the button"
        );
        while let Ok(frame) = old_frames.try_recv() {
            ensure!(
                !frame.message.to_text()?.contains("new-options"),
                "Old owner received a proposal"
            );
        }
        ensure!(
            !chat_messages(&h.frames(1)?)
                .iter()
                .any(|v| v["text"].as_str().unwrap_or("").contains("new-options")),
            "Requester received owner-only action"
        );
        Ok::<(), anyhow::Error>(())
    }
    .await;
    h.close().await?;
    outcome
}

#[tokio::test]
async fn tags_use_authoritative_sorted_frames_and_private_live_acknowledgements() -> Result<()> {
    let Some(mut h) = Harness::new(&["Alice", "Bob"]).await? else {
        return Ok(());
    };
    let outcome = async {
        let id = h.create(0, "Tags", json!({})).await?;
        h.send(1, "tableJoin", json!({"tableId":id})).await?;
        h.send(0, "tableStart", json!({"tableId":id})).await?;
        h.barrier(0).await?;
        h.frames(0)?;
        h.frames(1)?;
        for _ in 0..2 {
            h.send(0, "tagAdd", json!({"tableId":id,"tag":" ALPHA <b> "}))
                .await?;
        }
        h.barrier(0).await?;
        let private = chat_messages(&h.frames(0)?);
        ensure!(
            private.len() == 2
                && private.iter().all(|v| v["text"]
                    == "Successfully added a tag of \"alpha &lt;b&gt;\"."
                    && v["recipient"] == "Alice"),
            "Unexpected live tag acknowledgements"
        );
        ensure!(
            chat_messages(&h.frames(1)?).is_empty(),
            "Live tag leaked to another player"
        );
        ensure!(
            h.snapshot(id).await?.0.game().unwrap().tags.len() == 1,
            "Live tag map duplicated an entry"
        );
        ensure!(
            h.send(1, "tagRemove", json!({"tableId":id,"tag":"alpha <b>"}))
                .await
                .is_err(),
            "Another author deleted a live tag"
        );
        h.send(0, "tableTerminate", json!({"tableId":id})).await?;
        h.barrier(0).await?;
        h.frames(0)?;
        h.frames(1)?;
        let game_id = h
            .snapshot(id)
            .await?
            .0
            .game()
            .unwrap()
            .game_id
            .context("The game was not saved")?;
        sqlx::query!(
            "INSERT INTO game_tags(game_id,user_id,tag) VALUES($1,2,'zeta'),($1,2,'alpha <b>')",
            game_id.0
        )
        .execute(&h.store.primary)
        .await?;
        for alias in ["/tags", "/taglist"] {
            h.send(0, "chat", json!({"tableId":id,"text":alias}))
                .await?;
            h.barrier(0).await?;
            for index in 0..2 {
                let chats = chat_messages(&h.frames(index)?);
                let lines = chats
                    .iter()
                    .map(|v| v["text"].as_str().unwrap_or(""))
                    .collect::<Vec<_>>();
                ensure!(
                    lines
                        == vec![
                            "The list of tags for this game are as follows:",
                            "1) alpha &lt;b&gt;",
                            "2) zeta"
                        ],
                    "Tag listing was stale, duplicated, unescaped, or combined"
                );
                ensure!(
                    chats.iter().all(|v| v.get("recipient").is_none()),
                    "Replay list was not public"
                );
            }
        }
        h.send(1, "tagRemove", json!({"tableId":id,"tag":"zeta"}))
            .await?;
        h.barrier(0).await?;
        ensure!(
            chat_messages(&h.frames(0)?)
                .iter()
                .any(|v| v["text"] == "Bob has deleted a game tag of \"zeta\"."),
            "Replay tag action was not published"
        );
        h.frames(1)?;
        h.send(0, "tagRemoveAll", json!({"tableId":id})).await?;
        h.send(1, "tagRemoveAll", json!({"tableId":id})).await?;
        h.barrier(0).await?;
        h.frames(0)?;
        h.frames(1)?;
        h.send(1, "chat", json!({"tableId":id,"text":"/tags"}))
            .await?;
        h.barrier(0).await?;
        ensure!(
            chat_messages(&h.frames(0)?)
                .iter()
                .map(|v| v["text"].as_str().unwrap_or(""))
                .collect::<Vec<_>>()
                == vec!["There are not yet any tags for this game."],
            "Empty tag list differs"
        );
        let leaked: i64 = sqlx::query_scalar!(
            "SELECT count(*) AS \"v!\" FROM chat_log WHERE message LIKE 'Successfully%tag%'"
        )
        .fetch_one(&h.store.primary)
        .await?;
        ensure!(
            leaked == 0,
            "Private live acknowledgement entered public archive"
        );
        Ok::<(), anyhow::Error>(())
    }
    .await;
    h.close().await?;
    outcome
}

#[tokio::test]
async fn playing_membership_is_separate_from_replay_attendance_and_bots_can_play_multiple_tables()
-> Result<()> {
    let Some(mut h) = Harness::new(&["Alice", "Bob", "Cathy", "Bot-Worker"]).await? else {
        return Ok(());
    };
    let outcome = async {
        let replay_id = h.replay(0).await?;
        let pregame = h.create(0, "Concurrent pregame", json!({})).await?;
        ensure!(
            matches!(h.snapshot(replay_id).await?.0.phase, Phase::Replay { .. })
                && matches!(h.snapshot(pregame).await?.0.phase, Phase::Pregame { .. }),
            "Creation evicted the attended replay"
        );
        h.send(
            0,
            "replayAction",
            json!({"tableId":replay_id,"action":{"type":"turn","turn":1}}),
        )
        .await?;
        h.send(0, "tableUnattend", json!({"tableId":pregame}))
            .await?;
        ensure!(
            h.send(
                0,
                "tableCreate",
                json!({"settings":{"name":"second human game"}})
            )
            .await
            .is_err(),
            "Unattending bypassed single-playing restriction"
        );
        h.send(0, "tableReattend", json!({"tableId":pregame}))
            .await?;
        let bot_one = h.create(3, "Bot first", json!({})).await?;
        let bot_two = h.create(3, "Bot second", json!({})).await?;
        ensure!(
            bot_one != bot_two,
            "Bot did not get distinct playing memberships"
        );
        let (old, _old_frames) = h.replace(3).await?;
        ensure!(
            !old.active(),
            "Bot logout/replacement did not fence every attendance"
        );
        h.send(3, "tableReattend", json!({"tableId":bot_one}))
            .await?;
        h.send(3, "tableReattend", json!({"tableId":bot_two}))
            .await?;
        let (old_alice, _old_frames) = h.replace(0).await?;
        ensure!(!old_alice.active(), "Human replacement was not fenced");
        h.send(0, "tableReattend", json!({"tableId":pregame}))
            .await?;
        h.send(0, "tableSpectate", json!({"tableId":replay_id}))
            .await?;
        let (reply, replied) = oneshot::channel();
        h.hub
            .send(HubCommand::Client {
                session: old_alice,
                message: client_message(
                    "replayAction",
                    &json!({"tableId":replay_id,"action":{"type":"turn","turn":9}}),
                )?,
                reply,
            })
            .await?;
        ensure!(
            replied.await?.is_err(),
            "Old generation mutated a separately attended replay"
        );
        h.hub.send(HubCommand::Logout(h.users[3].clone())).await?;
        h.barrier(0).await?;
        ensure!(
            !h.users[3].active(),
            "Explicit logout did not cancel multi-table session"
        );
        ensure!(
            h.snapshot(bot_one).await?.0.players()[0].is(UserId(4))
                && h.snapshot(bot_two).await?.0.players()[0].is(UserId(4)),
            "Logout lost durable bot memberships"
        );
        Ok::<(), anyhow::Error>(())
    }
    .await;
    h.close().await?;
    outcome
}

#[tokio::test]
async fn pending_join_claim_survives_replacement_until_the_committed_view_is_published()
-> Result<()> {
    let Some(mut h) = Harness::new(&["Alice", "Bob", "Cathy"]).await? else {
        return Ok(());
    };
    let outcome = async {
        let first = h.create(0, "First", json!({})).await?;
        let second = h.create(2, "Second", json!({})).await?;
        h.barrier(1).await?;
        h.frames(1)?;
        // Hold the table's checkpoint row so that the join's save waits.
        let mut blocker = h.db.pool.begin().await?;
        sqlx::query_scalar!(
            "SELECT id FROM live_tables WHERE id = $1 FOR UPDATE",
            i64::try_from(first.0)?
        )
        .fetch_one(&mut *blocker)
        .await?;
        let joining = h.begin(1, "tableJoin", json!({"tableId":first})).await?;
        tokio::time::timeout(Duration::from_secs(2), async {
            loop {
                let waiting = sqlx::query_scalar!(
                    "SELECT EXISTS(SELECT 1 FROM pg_stat_activity
                     WHERE wait_event_type = 'Lock' AND query LIKE 'UPDATE live_tables%') AS \"blocked!\""
                )
                .fetch_one(&h.db.pool)
                .await?;
                if waiting {
                    return Ok::<(), anyhow::Error>(());
                }
                tokio::time::sleep(Duration::from_millis(10)).await;
            }
        })
        .await??;
        let (old, mut old_frames) = h.replace(1).await?;
        ensure!(!old.active(), "Old joining generation remained active");
        ensure!(
            h.send(1, "tableJoin", json!({"tableId":second}))
                .await
                .unwrap_err()
                .to_string()
                .contains("pending"),
            "Replacement bypassed pending join claim"
        );
        ensure!(
            h.send(
                1,
                "tableCreate",
                json!({"settings":{"name":"racing creation"}})
            )
            .await
            .unwrap_err()
            .to_string()
            .contains("pending"),
            "Replacement bypassed pending create restriction"
        );
        blocker.rollback().await?;
        joining.await??;
        h.barrier(1).await?;
        ensure!(
            h.snapshot(first)
                .await?
                .0
                .players()
                .iter()
                .any(|p| p.is(UserId(2))),
            "Accepted old-generation join was lost"
        );
        ensure!(
            h.send(1, "tableJoin", json!({"tableId":second}))
                .await
                .unwrap_err()
                .to_string()
                .contains("more than one"),
            "Claim released before committed membership publication"
        );
        h.send(1, "tableReattend", json!({"tableId":first})).await?;
        h.barrier(1).await?;
        while let Ok(frame) = old_frames.try_recv() {
            ensure!(
                !frame.message.to_text()?.starts_with("tableJoined "),
                "Old generation received delayed private join output"
            );
        }
        Ok::<(), anyhow::Error>(())
    }
    .await;
    h.close().await?;
    outcome
}

#[tokio::test]
async fn ban_disconnects_every_session_from_the_banned_ip() -> Result<()> {
    let Some(h) = Harness::new(&[]).await? else {
        return Ok(());
    };
    let outcome = async {
        let mut outgoing = vec![];
        let mut sessions = vec![];
        for (user, name, ip) in [
            (1, "Alice", "192.0.2.1"),
            (2, "AliceAlt", "192.0.2.1"),
            (3, "Bob", "192.0.2.2"),
        ] {
            let (session, receiver) = Session::with_token(
                crate::transport::Identity {
                    user: UserId(user),
                    name: name.into(),
                    normalized_name: crate::accounts::normalize_username(name),
                    ip: ip.into(),
                    bot: false,
                },
                1,
                tokio_util::sync::CancellationToken::new(),
                Arc::new(Semaphore::new(crate::transport::GLOBAL_OUTPUT_BYTES)),
            );
            h.register(session.clone()).await?;
            sessions.push(session);
            outgoing.push(receiver);
        }
        let (reply, replied) = oneshot::channel();
        h.hub
            .send(HubCommand::Operations {
                command: Operation::Ban {
                    user_id: UserId(1),
                    ip: "192.0.2.1".into(),
                },
                reply,
            })
            .await?;
        replied.await??;
        // Commands are no longer checked against the ban list, so other accounts on the
        // banned address must be disconnected too.
        ensure!(
            sessions[0].cancel.is_cancelled() && sessions[1].cancel.is_cancelled(),
            "A session from the banned IP stayed connected"
        );
        ensure!(
            !sessions[2].cancel.is_cancelled(),
            "A session from another IP was disconnected"
        );
        Ok(())
    }
    .await;
    h.close().await?;
    outcome
}

#[tokio::test]
async fn replay_arrows_sounds_and_loads_skip_durable_checkpoints() -> Result<()> {
    let Some(mut h) = Harness::new(&["Alice"]).await? else {
        return Ok(());
    };
    let result = async {
        let id = h.replay(0).await?;
        let (_, revision) = h.snapshot(id).await?;
        h.send(0, "loaded", json!({"tableId":id})).await?;
        for (kind, extra) in [
            ("arrow", json!({"target":0})),
            ("sound", json!({"sound":"clap"})),
        ] {
            let mut data = json!({"tableId":id,"action":{"type":kind}});
            data["action"]
                .as_object_mut()
                .context("object")?
                .extend(extra.as_object().context("object")?.clone());
            h.send(0, "replayAction", data).await?;
        }
        ensure!(
            h.snapshot(id).await?.1 == revision,
            "Loading or an arrow or sound wrote a checkpoint"
        );
        // A segment change is still saved.
        tokio::time::sleep(Duration::from_millis(50)).await;
        h.send(
            0,
            "replayAction",
            json!({"tableId":id,"action":{"type":"turn","turn":1}}),
        )
        .await?;
        let (table, saved) = h.snapshot(id).await?;
        ensure!(saved > revision, "A segment change was not saved");
        let Phase::Replay { replay, .. } = &table.phase else {
            bail!("Not a replay");
        };
        ensure!(replay.segment.0 == 1, "The saved segment is stale");
        Ok(())
    }
    .await;
    h.close().await?;
    result
}

#[tokio::test]
async fn table_chat_commands_link_to_the_server_url() -> Result<()> {
    let Some(mut h) = Harness::new(&["Alice", "Bob"]).await? else {
        return Ok(());
    };
    let outcome = async {
        let id = h.create(0, "Chat commands", json!({})).await?;
        h.send(1, "tableJoin", json!({"tableId":id})).await?;
        for (command, expected) in [
            ("/replay 5 3", "http://localhost/replay/5#3"),
            ("/missing", "http://localhost/shared-missing-scores/2/"),
        ] {
            h.barrier(0).await?;
            h.frames(0)?;
            h.send(0, "chat", json!({"text":command,"tableId":id}))
                .await?;
            h.barrier(0).await?;
            let messages = chat_messages(&h.frames(0)?);
            ensure!(
                messages
                    .iter()
                    .any(|m| m["text"].as_str().is_some_and(|msg| msg.contains(expected))),
                "{command} did not reply with {expected}: {messages:?}"
            );
        }
        Ok(())
    }
    .await;
    h.close().await?;
    outcome
}

#[tokio::test]
async fn table_chat_is_rate_limited_per_player() -> Result<()> {
    let Some(mut h) = Harness::new(&["Alice", "Bob"]).await? else {
        return Ok(());
    };
    let outcome = async {
        let id = h.create(0, "Chatty", json!({})).await?;
        h.send(1, "tableJoin", json!({"tableId":id})).await?;
        for index in 0..TABLE_CHAT_LIMIT {
            h.send(
                0,
                "chat",
                json!({"tableId":id,"text":format!("Message {index}")}),
            )
            .await?;
        }
        let refused = h
            .send(0, "chat", json!({"tableId":id,"text":"One too many"}))
            .await
            .expect_err("Chat past the limit was accepted");
        ensure!(
            refused.to_string().contains("too quickly"),
            "Unexpected refusal: {refused:#}"
        );
        h.send(
            1,
            "chat",
            json!({"tableId":id,"text":"Players have separate limits"}),
        )
        .await?;
        Ok(())
    }
    .await;
    h.close().await?;
    outcome
}

#[tokio::test]
async fn commands_for_another_phase_are_rejected() -> Result<()> {
    let Some(mut h) = Harness::new(&["Alice", "Bob"]).await? else {
        return Ok(());
    };
    let outcome = async {
        let id = h.create(0, "Phases", json!({})).await?;
        h.send(1, "tableJoin", json!({"tableId": id})).await?;
        let refusal = |error: anyhow::Error| {
            ensure!(
                matches!(
                    error.downcast_ref::<CommandError>(),
                    Some(CommandError::Rejected { .. })
                ),
                "Not a rejection: {error:#}"
            );
            Ok(error.to_string())
        };
        let error = h
            .send(
                0,
                "playerAction",
                json!({"tableId":id,"action":{"type": "discard", "order": 0}}),
            )
            .await
            .expect_err("A pregame accepted a game action");
        ensure!(refusal(error)? == "Not an ongoing game");
        let error = h
            .send(
                0,
                "replayAction",
                json!({"tableId":id,"action":{"type":"turn","turn":1}}),
            )
            .await
            .expect_err("A pregame accepted a replay action");
        ensure!(refusal(error)? == "Not a replay");
        h.send(0, "tableStart", json!({"tableId": id})).await?;
        let error = h
            .send(
                0,
                "tableUpdate",
                json!({"tableId": id, "settings": {"name": "Later"}}),
            )
            .await
            .expect_err("A live game accepted new options");
        ensure!(refusal(error)? == "Game already started");
        Ok::<(), anyhow::Error>(())
    }
    .await;
    h.close().await?;
    outcome
}

#[tokio::test]
async fn a_failed_table_creation_ends_its_seat_reservation() -> Result<()> {
    let Some(mut h) = Harness::new(&["Alice"]).await? else {
        return Ok(());
    };
    let outcome = async {
        ensure!(
            h.send(
                0,
                "tableCreate",
                json!({"settings":{"name":"Broken","options":{"variantName":"No Such Variant"}}}),
            )
            .await
            .is_err(),
            "A table with an unknown variant was created"
        );
        h.create(0, "Working", json!({})).await?;
        Ok::<(), anyhow::Error>(())
    }
    .await;
    h.close().await?;
    outcome
}

#[tokio::test]
async fn a_link_to_an_ended_table_forgets_it_without_a_warning() -> Result<()> {
    let Some(mut h) = Harness::new(&["Alice"]).await? else {
        return Ok(());
    };
    let outcome = async {
        let error = h
            .send(0, "tableSpectate", json!({"tableId":999_999}))
            .await
            .err()
            .context("Spectating an unknown table succeeded")?;
        ensure!(
            matches!(
                error.downcast_ref::<CommandError>(),
                Some(CommandError::Rejected { silent: true, .. })
            ),
            "An unknown table was not rejected silently: {error:#}"
        );
        ensure!(
            h.receive(0, "tableRemoved").await?["tableId"] == json!(999_999),
            "The client was not told to forget the unknown table"
        );
        Ok::<(), anyhow::Error>(())
    }
    .await;
    h.close().await?;
    outcome
}

#[tokio::test]
async fn saved_characters_store_none_as_null() -> Result<()> {
    let Some(mut h) = Harness::new(&["Alice", "Bob"]).await? else {
        return Ok(());
    };
    let outcome = async {
        for characters in [true, false] {
            let id = h
                .create(
                    0,
                    "Characters",
                    json!({"options":{"detrimentalCharacters":characters}}),
                )
                .await?;
            h.send(1, "tableJoin", json!({"tableId":id})).await?;
            h.send(0, "tableStart", json!({"tableId":id})).await?;
            h.receive(0, "tableStarted").await?;
            let (table, _) = h.snapshot(id).await?;
            let expected = table
                .game()
                .context("Missing game")?
                .game
                .players
                .iter()
                .map(|p| {
                    let character = p
                        .character()
                        .map(|c| {
                            Ok::<_, anyhow::Error>(i16::try_from(
                                crate::game::catalog_character(c)?.id.0,
                            )?)
                        })
                        .transpose()?;
                    let metadata = p.assigned_value().map(i16::try_from).transpose()?;
                    Ok((character, metadata))
                })
                .collect::<Result<Vec<_>>>()?;
            ensure!(
                expected.iter().all(|(c, _)| c.is_some() == characters),
                "Unexpected characters: {expected:?}"
            );
            h.send(0, "tableTerminate", json!({"tableId":id})).await?;
            h.barrier(0).await?;
            let saved = sqlx::query!(
                "SELECT p.character_id,p.assigned_metadata FROM game_participants p
                 JOIN games g ON g.id=p.game_id WHERE g.detrimental_characters=$1 ORDER BY p.seat",
                characters
            )
            .fetch_all(&h.store.primary)
            .await?
            .into_iter()
            .map(|r| (r.character_id, r.assigned_metadata))
            .collect::<Vec<_>>();
            ensure!(
                saved == expected,
                "Saved characters {saved:?} instead of {expected:?}"
            );
            h.send(0, "tableLeave", json!({"tableId":id})).await?;
            h.send(1, "tableLeave", json!({"tableId":id})).await?;
            h.barrier(0).await?;
            h.barrier(1).await?;
        }
        Ok(())
    }
    .await;
    h.close().await?;
    outcome
}

#[tokio::test]
async fn saved_actions_store_null_for_a_missing_target_or_value() -> Result<()> {
    let Some(mut h) = Harness::new(&["Alice", "Bob"]).await? else {
        return Ok(());
    };
    let outcome = async {
        let id = h.create(0, "Votes", json!({})).await?;
        h.send(1, "tableJoin", json!({"tableId":id})).await?;
        h.send(0, "tableStart", json!({"tableId":id})).await?;
        h.receive(0, "tableStarted").await?;
        let (table, _) = h.snapshot(id).await?;
        let game = &table.game().context("Missing game")?.game;
        let active = game.active_player_index;
        let index = h
            .users
            .iter()
            .position(|user| table.players()[active].is(user.user))
            .context("Missing active player")?;
        let card = game.players[active].hand[0];
        h.send(
            index,
            "playerAction",
            json!({"tableId":id,"action":{"type":"play","order":card}}),
        )
        .await?;
        for index in 0..2 {
            h.send(index, "tableTerminateVote", json!({"tableId":id}))
                .await?;
        }
        h.barrier(0).await?;
        let actions = sqlx::query!(
            "SELECT a.game_id,a.type,a.target,a.value FROM game_actions a ORDER BY a.game_id,a.turn"
        )
        .fetch_all(&h.store.primary)
        .await?;
        let stored = actions
            .iter()
            .map(|a| (a.r#type, a.target, a.value))
            .collect::<Vec<_>>();
        let play = i16::try_from(i32::from(hanabi_engine::RecordedActionType::Play))?;
        let vote = i16::try_from(i32::from(hanabi_engine::RecordedActionType::GameOverByVote))?;
        let end = i16::try_from(EndCondition::TerminatedByVote as i32)?;
        ensure!(
            stored
                == [
                    (play, i16::try_from(card).ok(), None),
                    (vote, None, Some(end))
                ],
            "Unexpected stored actions: {stored:?}"
        );
        // A replay of the saved game reads the actions back.
        let game = actions.first().context("Missing saved game")?.game_id;
        h.send(
            0,
            "replayCreate",
            json!({"source":{"type":"saved","gameId":game},"visibility":{"type":"solo"}}),
        )
        .await?;
        let replay = h.receive(0, "tableStarted").await?["tableId"].clone();
        h.send(0, "gameStateLoad", json!({"tableId":replay}))
            .await?;
        let history = h.receive(0, "gameEventList").await?;
        let events = history["events"].as_array().context("Missing actions")?;
        ensure!(
            events.iter().any(|event| {
                ["play", "misplay"].contains(&event["type"].as_str().unwrap_or_default())
                    && event["order"] == card
            }) && events
                .iter()
                .any(|event| event["type"] == "gameOver" && event.get("playerIndex").is_none()),
            "The replay lost the saved actions: {history}"
        );
        Ok(())
    }
    .await;
    h.close().await?;
    outcome
}
