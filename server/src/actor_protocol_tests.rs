use super::*;
use crate::{
    state::{RedisState, StateId},
    test_redis::RedisFixture,
    transport::Outbound,
};
use sqlx::{
    PgPool,
    postgres::{PgConnectOptions, PgPoolOptions},
};
use std::str::FromStr;

struct Harness {
    admin: PgPool,
    database: String,
    store: Store,
    state: RedisState,
    hub: mpsc::Sender<HubCommand>,
    tasks: TaskTracker,
    users: Vec<Arc<Session>>,
    outgoing: Vec<mpsc::Receiver<Outbound>>,
    redis: RedisFixture,
}
impl Harness {
    async fn new(names: &[&str]) -> Result<Option<Self>> {
        let Ok(url) = std::env::var("HANABI_TEST_DATABASE_URL") else {
            eprintln!("Actor protocol tests require HANABI_TEST_DATABASE_URL");
            return Ok(None);
        };
        let options = PgConnectOptions::from_str(&url)?;
        ensure!(
            options.get_host().starts_with('/')
                || matches!(options.get_host(), "localhost" | "127.0.0.1"),
            "Disposable local PostgreSQL required"
        );
        let admin = PgPoolOptions::new()
            .max_connections(1)
            .connect_with(options.clone())
            .await?;
        let database = format!("ts_slice_{:032x}", rand::random::<u128>());
        #[expect(
            clippy::disallowed_methods,
            reason = "a database name cannot be a bound parameter"
        )]
        sqlx::query(sqlx::AssertSqlSafe(format!("CREATE DATABASE {database}")))
            .execute(&admin)
            .await?;
        let pool = PgPoolOptions::new()
            .max_connections(8)
            .connect_with(options.database(&database))
            .await?;
        #[expect(
            clippy::disallowed_methods,
            reason = "the schema file has many statements, which the query macros cannot run"
        )]
        sqlx::raw_sql(include_str!("../../install/database_schema.sql"))
            .execute(&pool)
            .await?;
        for (index, name) in names.iter().enumerate() {
            sqlx::query!("INSERT INTO users(id,username,normalized_username,password_hash,last_ip) VALUES($1,$2,$3,'fixture','127.0.0.1')", hanabi_engine::int(index)+1, name, crate::accounts::normalize_username(name)).execute(&pool).await?;
        }
        let redis = RedisFixture::start(true).await?;
        let state = RedisState::connect(&redis.url, "actor-protocol").await?;
        let store = Store::fixture(pool, state.clone());
        let tasks = TaskTracker::new();
        let hub = Hub::start(
            store.clone(),
            tasks.clone(),
            crate::server_info::test_info(),
        )
        .await?;
        let mut h = Self {
            admin,
            database,
            store,
            state,
            hub,
            tasks,
            users: vec![],
            outgoing: vec![],
            redis,
        };
        for (index, name) in names.iter().enumerate() {
            let (session, outgoing) =
                Session::new(hanabi_engine::int(index) + 1, (*name).into(), 1, false);
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
                welcome: test_welcome(),
                initial: vec![],
                reply,
            })
            .await?;
        replied.await?
    }
    async fn replace(&mut self, index: usize) -> Result<(Arc<Session>, mpsc::Receiver<Outbound>)> {
        let old = self.users[index].clone();
        let (session, outgoing) =
            Session::new(old.user, old.name.clone(), old.generation + 1, false);
        self.register(session.clone()).await?;
        self.users[index] = session;
        Ok((old, std::mem::replace(&mut self.outgoing[index], outgoing)))
    }
    async fn begin(
        &self,
        index: usize,
        command: &str,
        data: Value,
    ) -> Result<oneshot::Receiver<Result<()>>> {
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
        .await??
    }
    async fn barrier(&self, index: usize) -> Result<()> {
        let (reply, replied) = oneshot::channel();
        self.hub
            .send(HubCommand::Directory {
                session: self.users[index].clone(),
                users: true,
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
    async fn create(&mut self, index: usize, name: &str, options: Value) -> Result<u64> {
        self.send(
            index,
            "tableCreate",
            json!({"name":name,"options":options,"maxPlayers":5}),
        )
        .await?;
        self.receive(index, "joined").await?["tableID"]
            .as_u64()
            .context("Missing table identity")
    }
    async fn replay(&mut self, index: usize) -> Result<u64> {
        self.send(index,"replayCreate",json!({"source":"json","visibility":"shared","gameJSON":{"players":["Alice","Bob"],"seed":"p2v0s1"}})).await?;
        self.receive(index, "tableStart").await?["tableID"]
            .as_u64()
            .context("Missing replay identity")
    }
    async fn snapshot(&self, id: u64) -> Result<(TableSnapshot, i64)> {
        let record = self
            .state
            .get(StateId::Table(id))
            .await?
            .context("Missing durable table")?;
        Ok((TableSnapshot::decode(&record.payload)?, record.revision))
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
        self.tasks = TaskTracker::new();
        self.hub = Hub::start(
            self.store.clone(),
            self.tasks.clone(),
            crate::server_info::test_info(),
        )
        .await?;
        for index in 0..self.users.len() {
            let old = &self.users[index];
            let (session, outgoing) =
                Session::new(old.user, old.name.clone(), old.generation + 1, false);
            self.register(session.clone()).await?;
            self.users[index] = session;
            self.outgoing[index] = outgoing;
        }
        Ok(())
    }
    async fn close(self) -> Result<()> {
        self.stop_hub().await?;
        self.store.close().await?;
        #[expect(
            clippy::disallowed_methods,
            reason = "a database name cannot be a bound parameter"
        )]
        sqlx::query(sqlx::AssertSqlSafe(format!(
            "DROP DATABASE {} WITH (FORCE)",
            self.database
        )))
        .execute(&self.admin)
        .await?;
        self.admin.close().await;
        Ok(())
    }
}
#[tokio::test]
async fn player_shadow_is_cleared_when_a_spectator_joins() -> Result<()> {
    let Some(mut h) = Harness::new(&["Alice", "Bob", "Observer"]).await? else {
        return Ok(());
    };
    let outcome = async {
        let id = h.create(0, "Joining after shadowing", json!({})).await?;
        for index in [1, 2] {
            h.send(
                index,
                "tableSpectate",
                json!({"tableID":id,"shadowingPlayerIndex":0}),
            )
            .await?;
        }
        h.send(1, "tableJoin", json!({"tableID":id})).await?;
        h.send(0, "tableStart", json!({"tableID":id})).await?;
        let (table, _) = h.snapshot(id).await?;
        for (index, player_id, spectator) in [(1, 2, false), (2, 1, true)] {
            let seat = table
                .players()
                .iter()
                .position(|p| p.id == player_id)
                .unwrap();
            h.send(index, "getGameInfo1", json!({"tableID":id})).await?;
            let init = h.receive(index, "init").await?;
            ensure!(
                init["ourPlayerIndex"] == json!(seat)
                    && init["spectating"] == spectator
                    && init["shadowing"] == spectator,
                "Joining changed the player or spectator viewpoint: {init}"
            );
        }
        ensure!(
            table.shadows.get(&2).copied().flatten().is_none(),
            "Joining retained a durable shadow selection"
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
        h.send(1, "tableJoin", json!({"tableID":id})).await?;
        h.send(0, "tableStart", json!({"tableID":id})).await?;
        h.stop_hub().await?;
        let (mut table, revision) = h.snapshot(id).await?;
        let alice = table.players().iter().position(|p| p.id == 1).unwrap();
        let bob = table.players().iter().position(|p| p.id == 2).unwrap();
        table.shadows.insert(2, Some(hanabi_engine::int(alice)));
        h.store.save(&table, revision).await?;
        h.tasks = TaskTracker::new();
        h.hub = Hub::start(
            h.store.clone(),
            h.tasks.clone(),
            crate::server_info::test_info(),
        )
        .await?;
        for index in 0..h.users.len() {
            h.replace(index).await?;
        }
        for restarted in [false, true] {
            if restarted {
                h.restart().await?;
            }
            h.send(1, "tableReattend", json!({"tableID":id})).await?;
            h.send(1, "getGameInfo1", json!({"tableID":id})).await?;
            let init = h.receive(1, "init").await?;
            ensure!(
                init["ourPlayerIndex"] == json!(bob)
                    && init["spectating"] == false
                    && init["shadowing"] == false,
                "A recovered player kept another player's viewpoint: {init}"
            );
            ensure!(
                h.snapshot(id)
                    .await?
                    .0
                    .shadows
                    .get(&2)
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
            .create(0, "Duck privacy", json!({"variantName":"Duck (5 Suits)"}))
            .await?;
        for index in 1..3 {
            h.send(index, "tableJoin", json!({"tableID":id})).await?;
        }
        h.send(0, "tableStart", json!({"tableID":id})).await?;
        h.send(3, "tableSpectate", json!({"tableID":id})).await?;
        h.send(
            4,
            "tableSpectate",
            json!({"tableID":id,"shadowingPlayerIndex":0}),
        )
        .await?;
        ensure!(
            h.send(0, "tableSpectate", json!({"tableID":id}))
                .await
                .is_err(),
            "Player obtained an unrestricted spectator view"
        );
        for index in 0..5 {
            h.send(index, "loaded", json!({"tableID":id})).await?;
        }
        h.barrier(0).await?;
        for index in 0..5 {
            h.frames(index)?;
        }
        let mut originals = vec![];
        for kind in [
            hanabi_protocol::RecordedActionType::ColorClue,
            hanabi_protocol::RecordedActionType::RankClue,
        ] {
            let (table, _) = h.snapshot(id).await?;
            let game = &table.game().unwrap().game.0;
            let seat = game.active_player_index;
            let target = (seat + 1) % game.players.len();
            let values = if kind == hanabi_protocol::RecordedActionType::ColorClue {
                0..5
            } else {
                1..6
            };
            let action = values
                .map(|value| hanabi_engine::PlayerAction {
                    action_type: kind,
                    target: hanabi_engine::int(target),
                    value,
                })
                .find(|action| !hanabi_engine::touched_orders(game, action).is_empty())
                .context("Missing legal clue")?;
            let index = h
                .users
                .iter()
                .position(|user| user.user == table.players()[seat].id)
                .unwrap();
            h.send(
                index,
                "action",
                json!({"tableID":id,"type":kind,"target":target,"value":action.value}),
            )
            .await?;
            h.barrier(index).await?;
            let clue =
                json!({"type":hanabi_engine::clue_type(kind).map(i32::from),"value":action.value});
            originals.push(clue.clone());
            for index in 0..5 {
                let events = h
                    .frames(index)?
                    .into_iter()
                    .filter(|(name, body)| name == "gameAction" && body["action"]["type"] == "clue")
                    .map(|(_, body)| body["action"].clone())
                    .collect::<Vec<_>>();
                ensure!(events.len() == 1, "Missing live clue event");
                ensure!(
                    events[0]["clue"]
                        == if index == 3 {
                            clue.clone()
                        } else {
                            json!({"type":-1,"value":-1})
                        },
                    "Live clue identity leaked or spectator view changed"
                );
                ensure!(
                    events[0]["list"]
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
                    h.send(index, "tableReattend", json!({"tableID":id}))
                        .await?;
                }
                h.send(3, "tableSpectate", json!({"tableID":id})).await?;
                h.send(
                    4,
                    "tableSpectate",
                    json!({"tableID":id,"shadowingPlayerIndex":0}),
                )
                .await?;
            }
            for index in 0..5 {
                h.send(index, "getGameInfo2", json!({"tableID":id})).await?;
                let history = h.receive(index, "gameActionList").await?;
                let clues = history["list"]
                    .as_array()
                    .unwrap()
                    .iter()
                    .filter(|event| event["type"] == "clue")
                    .map(|event| event["clue"].clone())
                    .collect::<Vec<_>>();
                let expected = if index == 3 {
                    originals.clone()
                } else {
                    vec![json!({"type":-1,"value":-1}); 2]
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
        h.send(0, "tableTerminate", json!({"tableID":id})).await?;
        for index in 0..5 {
            h.send(index, "getGameInfo2", json!({"tableID":id})).await?;
            let history = h.receive(index, "gameActionList").await?;
            let clues = history["list"]
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
        h.send(1, "tableJoin", json!({"tableID":id})).await?;
        for phase in 0..3 {
            if phase == 1 {
                h.send(1, "tableStart", json!({"tableID":id})).await?;
                for index in 0..2 {
                    h.send(index, "loaded", json!({"tableID":id})).await?;
                }
            } else if phase == 2 {
                h.send(0, "tableTerminate", json!({"tableID":id})).await?;
            }
            h.barrier(0).await?;
            for index in 0..3 {
                h.frames(index)?;
            }
            let before = h.snapshot(id).await?.0.chat.len();
            let actor = usize::from(phase == 1);
            let target = 1 - actor;
            let data = json!({"tableID":id,"name":h.users[target].name});
            h.send(actor, "tableSetLeader", data).await?;
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
                ensure!(messages[0]["msg"] == expected && messages[0]["source"] == "server");
                ensure!(messages[0].get("recipient").is_none());
            }
            ensure!(
                chat_messages(&h.frames(2)?).is_empty(),
                "Leader notice leaked outside the table"
            );
            let table = h.snapshot(id).await?.0;
            ensure!(
                table.chat.len() == before + 1 && table.chat[before].message["msg"] == expected
            );
            ensure!(
                h.send(
                    2,
                    "tableSetLeader",
                    json!({"tableID":id,"name":h.users[actor].name})
                )
                .await
                .is_err()
            );
            ensure!(
                h.send(
                    actor,
                    "tableSetLeader",
                    json!({"tableID":id,"name":"Absent"})
                )
                .await
                .is_err()
            );
            ensure!(
                h.send(
                    actor,
                    "tableSetLeader",
                    json!({"tableID":id,"name":h.users[target].name})
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
            let revision = h.store.save(&table, 0).await?;
            let (hub, mut notifications) = mpsc::channel(32);
            let capacity = Arc::new(Semaphore::new(1));
            let mut actor = TableActor::new(
                table,
                revision,
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
                h.state.get(StateId::Table(id)).await?.is_none(),
                "Expired review remains in Redis"
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
        let revision = h.store.save(&table, 0).await?;
        let (hub, _notifications) = mpsc::channel(32);
        let capacity = Arc::new(Semaphore::new(1));
        let mut actor = TableActor::new(
            table,
            revision,
            h.store.clone(),
            hub,
            capacity.try_acquire_owned()?,
            crate::server_info::test_info(),
        );
        actor
            .cleanup(Instant::now().checked_sub(Duration::from_secs(61)).unwrap())
            .await?;
        actor.reattend(h.users[1].clone(), true, None).await?;
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
        let revision = h.store.save(&table, 0).await?;
        let (hub, _notifications) = mpsc::channel(32);
        let capacity = Arc::new(Semaphore::new(1));
        let mut actor = TableActor::new(
            table,
            revision,
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
            actor.retired && h.state.get(StateId::Table(id)).await?.is_none(),
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
        let revision = h.store.save(&table, 0).await?;
        let (hub, _notifications) = mpsc::channel(32);
        let capacity = Arc::new(Semaphore::new(1));
        let mut actor = TableActor::new(
            table,
            revision,
            h.store.clone(),
            hub,
            capacity.try_acquire_owned()?,
            crate::server_info::test_info(),
        );
        actor.initialize(h.users[0].clone(), vec![]).await?;
        let action = json!({"type":"turn","num":1,"currentPlayerIndex":1});
        for request in [
            json!({"tableID":id,"type":"hypoStart"}),
            json!({"tableID":id,"type":"hypoAction","action":action}),
            json!({"tableID":id,"type":"hypoBack"}),
        ] {
            let mut next = actor.candidate();
            next.game_mut().unwrap().idle_remaining = 1000;
            actor.persist(next).await?;
            actor.anchor = Instant::now()
                .checked_sub(Duration::from_millis(900))
                .unwrap();
            actor
                .replay_action(h.users[0].clone(), serde_json::from_value(request)?)
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
            h.send(index, "tableSpectate", json!({"tableID":id}))
                .await?;
        }
        h.restart().await?;
        for index in 0..3 {
            let welcome = h.receive(index, "welcome").await?;
            ensure!(
                welcome["disconSpectatingTable"] == json!(id),
                "A spectator was not sent back to the restored replay: {welcome}"
            );
            // The client spectates the table it was told about.
            h.send(index, "tableSpectate", json!({"tableID":id}))
                .await?;
            ensure!(
                h.receive(index, "tableStart").await?["tableID"] == json!(id),
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
async fn shared_replay_links_join_an_existing_replay_of_the_same_game() -> Result<()> {
    let Some(mut h) = Harness::new(&["Alice", "Bob", "Carol"]).await? else {
        return Ok(());
    };
    let outcome = async {
        let game: i32 = sqlx::query_scalar!("INSERT INTO games(name,num_players,variant_id,timed,time_base,time_per_turn,
             speedrun,card_cycle,deck_plays,empty_clues,one_extra_card,one_less_card,
             all_or_nothing,detrimental_characters,seed,score,num_turns,end_condition,datetime_started,datetime_finished)
             VALUES('Linked game',2,0,false,120,20,false,false,false,false,false,false,false,false,'p2v0s1',0,1,4,NOW(),NOW())
             RETURNING id")
        .fetch_one(&h.store.primary)
        .await?;
        sqlx::query!("INSERT INTO game_participants(game_id,user_id,seat,character_assignment,character_metadata)
             VALUES($1,1,0,0,0),($1,2,1,0,0)", game)
        .execute(&h.store.primary)
        .await?;
        // The game was terminated on its first turn.
        sqlx::query!("INSERT INTO game_actions(game_id,turn,type,target,value) VALUES($1,0,4,0,4)", game)
            .execute(&h.store.primary)
            .await?;
        let request = |visibility: &str, join_existing: bool| {
            json!({"source":"id","databaseID":game,"visibility":visibility,"joinExisting":join_existing})
        };
        let open = async |h: &mut Harness, index: usize, request: Value| -> Result<Value> {
            h.send(index, "replayCreate", request).await?;
            Ok(h.receive(index, "tableStart").await?["tableID"].clone())
        };

        let shared = open(&mut h, 0, request("shared", true)).await?;
        ensure!(
            open(&mut h, 1, request("shared", true)).await? == shared,
            "A link did not join the existing shared replay"
        );
        ensure!(
            open(&mut h, 2, request("shared", false)).await? != shared,
            "Creating a shared replay from the lobby joined an existing one"
        );
        ensure!(
            open(&mut h, 2, request("solo", true)).await? != shared,
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
        let request = |visibility: &str| {
            json!({"source":"json","visibility":visibility,"spoilerFree":true,
                "gameJSON":{"players":["Alice","Bob"],"seed":"p2v0s1"}})
        };
        ensure!(
            h.send(0, "replayCreate", request("solo")).await.is_err(),
            "A solo replay was created as a spoiler-free review"
        );
        h.send(0, "replayCreate", request("shared")).await?;
        let id = h.receive(0, "tableStart").await?["tableID"].clone();
        h.send(
            1,
            "tableSpectate",
            json!({"tableID":id,"shadowingPlayerIndex":-1}),
        )
        .await?;
        h.send(1, "getGameInfo1", json!({"tableID":id})).await?;
        let init = h.receive(1, "init").await?;
        ensure!(
            init["sharedReplay"] == true && init["spoilerFree"] == true,
            "A spectator joined a spoiler-free review without being told: {init}"
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
            json!({"name":"Full table","options":{},"maxPlayers":2}),
        )
        .await?;
        let id = h.receive(0, "joined").await?["tableID"].clone();
        h.send(1, "tableJoin", json!({"tableID":id})).await?;
        h.receive(0, "chat").await?; // "Bob joined the game."
        for _ in 0..2 {
            let error = h
                .send(2, "tableJoin", json!({"tableID":id}))
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
            chat["msg"] == "Carol tried to join, but the table is full.",
            "Unexpected chat: {chat}"
        );
        let (table, _) = h.snapshot(id.as_u64().context("Missing table ID")?).await?;
        let notices = table
            .chat
            .iter()
            .filter(|c| c.message.to_string().contains("tried to join"))
            .count();
        ensure!(notices == 1, "The table was told {notices} times");
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
        let refused = async |h: &Harness, index: usize, command: &str, id: u64| -> Result<String> {
            match h.send(index, command, json!({"tableID":id})).await {
                Ok(()) => bail!("{command} was allowed"),
                Err(error) => Ok(error.to_string()),
            }
        };
        // Run the lobby command and hand its effects to the hub, as the web layer does.
        let change = async |h: &Harness, index: usize, command: &str, name: &str| -> Result<()> {
            let session = h.users[index].clone();
            let caller = crate::lobby::Caller {
                id: session.user,
                name: session.name.clone(),
                normalized_name: session.normalized_name.clone(),
                ip: session.ip.clone(),
                generation: session.generation,
            };
            let effects = crate::lobby::dispatch(
                &h.store.primary,
                "secret",
                &caller,
                &[],
                client_message(command, &json!({"name":name,"room":"lobby"}))?,
            )
            .await?
            .context("Missing lobby effects")?;
            let (reply, replied) = oneshot::channel();
            h.hub
                .send(HubCommand::LobbyEffects {
                    session,
                    effects,
                    reply,
                })
                .await?;
            replied.await?
        };

        // Alice blocks Bob: Bob can neither join nor spectate Alice's table.
        change(&h, 0, "chatBlock", "Bob").await?;
        let id = h.create(0, "Blocking", json!({})).await?;
        ensure!(refused(&h, 1, "tableJoin", id).await? == "You cannot join this table.");
        ensure!(refused(&h, 1, "tableSpectate", id).await? == "You cannot spectate this table.");
        h.send(2, "tableJoin", json!({"tableID":id})).await?;

        // Carol blocks Alice after sitting down; she can still return to her own seat.
        change(&h, 2, "chatBlock", "Alice").await?;
        h.send(2, "tableReattend", json!({"tableID":id})).await?;
        h.send(0, "tableStart", json!({"tableID":id})).await?;
        ensure!(refused(&h, 1, "tableSpectate", id).await? == "You cannot spectate this table.");

        // The block applies whoever made it: Alice cannot join a replay that Bob leads.
        let replay = h.replay(1).await?;
        ensure!(refused(&h, 0, "tableSpectate", replay).await? == "You cannot join this replay.");

        // Unblocking takes effect for both sessions right away.
        change(&h, 0, "chatUnblock", "Bob").await?;
        h.send(0, "tableSpectate", json!({"tableID":replay}))
            .await?;
        h.send(1, "tableSpectate", json!({"tableID":id})).await?;
        Ok(())
    }
    .await;
    h.close().await?;
    outcome
}

#[tokio::test]
async fn spectators_return_to_ongoing_games_and_shared_replays_after_reconnecting() -> Result<()> {
    let Some(mut h) = Harness::new(&["Alice", "Bob", "Carol", "Dave", "Erin"]).await? else {
        return Ok(());
    };
    let outcome = async {
        let game = h.create(0, "Spectated game", json!({})).await?;
        h.send(1, "tableJoin", json!({"tableID":game})).await?;
        h.send(0, "tableStart", json!({"tableID":game})).await?;
        h.send(2, "tableSpectate", json!({"tableID":game,"shadowingPlayerIndex":1}))
            .await?;
        let replay = h.replay(3).await?;
        h.send(4, "tableSpectate", json!({"tableID":replay})).await?;

        // Carol shadows seat 1 of the ongoing game; Erin watches Dave's shared replay.
        for restarted in [false, true] {
            if restarted {
                h.restart().await?;
            } else {
                for index in [2, 4] {
                    h.replace(index).await?;
                }
            }
            for (index, table, seat) in [(2, game, 1), (4, replay, -1)] {
                let welcome = h.receive(index, "welcome").await?;
                ensure!(
                    welcome["disconSpectatingTable"] == json!(table)
                        && welcome["disconShadowingSeat"] == json!(seat),
                    "A spectator was not sent back to their table (restarted: {restarted}): {welcome}"
                );
                // The client spectates the table it was told about.
                h.send(
                    index,
                    "tableSpectate",
                    json!({"tableID":table,"shadowingPlayerIndex":seat}),
                )
                .await?;
                ensure!(
                    h.receive(index, "tableStart").await?["tableID"] == json!(table),
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
async fn default_table_names_use_the_creator_and_remain_editable() -> Result<()> {
    let names = ["Alice", "Ren\u{e9}"];
    let Some(mut h) = Harness::new(&names).await? else {
        return Ok(());
    };
    let outcome = async {
        for (index, name) in names.iter().enumerate() {
            let id = h.create(index, "", json!({})).await?;
            let expected = format!("{name}'s table");
            ensure!(
                h.snapshot(id).await?.0.name == expected,
                "Incorrect default table name"
            );
            h.send(
                index,
                "tableUpdate",
                json!({
                    "tableID": id, "name": expected, "options": {}, "maxPlayers": 5
                }),
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
        if let Phase::Pregame {
            players,
            countdown,
            automatic_start,
            ..
        } = &mut table.phase
        {
            for user in &h.users[1..3] {
                players.push(Player {
                    id: user.user,
                    name: user.name.clone(),
                    stats: crate::store::zero_stats(),
                });
            }
            *countdown = Some(Utc::now() + ChronoDuration::minutes(5));
            *automatic_start = Some(3);
        }
        let revision = h.store.save(&table, 0).await?;
        let capacity = Arc::new(Semaphore::new(1));
        let (hub, mut notifications) = mpsc::channel(64);
        let mut actor = TableActor::new(
            table,
            revision,
            h.store.clone(),
            hub,
            capacity.try_acquire_owned()?,
            crate::server_info::test_info(),
        );
        for user in &h.users[..3] {
            actor.initialize(user.clone(), vec![]).await?;
        }
        actor.reattend(h.users[3].clone(), true, Some(1)).await?;
        while notifications.try_recv().is_ok() {}
        h.users[0].cancel.cancel();
        let now = Instant::now();
        actor.cleanup(now).await?;
        actor.cleanup(now + PREGAME_RECONNECT_GRACE).await?;
        let (restored, _) = h.snapshot(id).await?;
        ensure!(
            restored.players().iter().map(|p| p.id).collect::<Vec<_>>() == vec![2, 3],
            "Disconnected owner kept a pregame seat"
        );
        ensure!(
            restored.owner == 2,
            "Ownership did not pass to a remaining player"
        );
        ensure!(
            matches!(
                restored.phase,
                Phase::Pregame {
                    countdown: None,
                    ..
                }
            ),
            "Departure did not cancel the start countdown"
        );
        ensure!(
            restored.shadows.get(&4) == Some(&Some(0)),
            "Departure changed the spectator's shadow target"
        );
        let mut published_owner = false;
        while let Ok(notification) = notifications.try_recv() {
            if let HubCommand::Effects(effects) = notification {
                for (session, message) in effects.messages {
                    if session.user == 2
                        && let Some(body) = message.strip_prefix("game ")
                    {
                        let game: Value = serde_json::from_str(body)?;
                        published_owner |= game["owner"] == 2
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
        h.send(1, "tableJoin", json!({"tableID":id})).await?;
        h.send(0, "tableStart", json!({"tableID":id})).await?;
        h.send(2, "tableSpectate", json!({"tableID":id})).await?;
        for index in 0..3 {
            h.send(index, "loaded", json!({"tableID":id})).await?;
        }
        let mut lock = h.store.primary.begin().await?;
        crate::store::advisory_lock(&mut lock, crate::store::LockSpace::VariantStats, 0).await?;
        let score = loop {
            let (table, _) = h.snapshot(id).await?;
            let snapshot = table.game().context("Missing game")?;
            let game = &snapshot.game;
            if game.end_condition != EndCondition::InProgress {
                ensure!(game.score > 0, "Expected an improved personal best");
                break game.score;
            }
            ensure!(game.turn < 150, "Game did not reach its final round");
            let active = game.active_player_index;
            let hand = &game.players[active].hand;
            let playable = hand.iter().find(|&&order| {
                let card = &game.deck[order];
                card.rank == game.stacks[card.suit_index] + 1
            });
            let action = if let Some(order) = playable {
                json!({"tableID":id,"type":0,"target":order})
            } else if game.clue_tokens == 8 {
                let target = 1 - active;
                let card = &game.deck[game.players[target].hand[0]];
                json!({"tableID":id,"type":3,"target":target,"value":card.rank})
            } else {
                json!({"tableID":id,"type":1,"target":hand[0]})
            };
            let actor = usize::try_from(snapshot.players[active].id)? - 1;
            h.send(actor, "action", action).await?;
            for index in 0..3 {
                h.frames(index)?;
            }
        };
        for index in 0..3 {
            h.barrier(index).await?;
            h.frames(index)?;
        }
        let mut pending = h
            .begin(0, "tableRestart", json!({"tableID":id,"hidePregame":false}))
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
        let mut remade = 0;
        for index in 0..3 {
            let frame = h.receive(index, "game").await?;
            remade = frame["tableID"].as_u64().context("Missing remade table")?;
            let players = frame["players"].as_array().context("Missing players")?;
            ensure!(players.len() == 2, "Spectator became a player");
            for player in players {
                ensure!(
                    player["stats"]["numGames"] == 1
                        && player["stats"]["variant"]["numGames"] == 1
                        && player["stats"]["variant"]["bestScores"][0]["score"] == score,
                    "Remade table published stale player statistics: {player}"
                );
            }
        }
        let (saved, _) = h.snapshot(remade).await?;
        for player in saved.players() {
            ensure!(
                player.stats["variant"]["bestScores"][0]["score"] == score,
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
        h.send(1, "tableJoin", json!({"tableID":id})).await?;
        h.send(1, "chatRead", json!({"tableID":id})).await?;
        let bob_read = h.snapshot(id).await?.0.chat.len();
        h.send(
            0,
            "chat",
            json!({"room":format!("table{id}"),"msg":"One unread message"}),
        )
        .await?;
        h.send(0, "chatRead", json!({"tableID":id})).await?;
        let alice_read = h.snapshot(id).await?.0.chat.len();
        h.send(0, "tableStart", json!({"tableID":id})).await?;
        for index in 0..2 {
            h.barrier(index).await?;
            h.frames(index)?;
            h.send(index, "tableReattend", json!({"tableID":id}))
                .await?;
            h.send(index, "getGameInfo2", json!({"tableID":id})).await?;
            let history = h.receive(index, "chatList").await?;
            ensure!(
                history["unread"] == i32::from(index != 0),
                "Game start reset the chat read position: {history}"
            );
            h.send(index, "loaded", json!({"tableID":id})).await?;
        }
        h.send(1, "tableUnattend", json!({"tableID":id})).await?;
        h.replace(1).await?;
        h.send(1, "tableReattend", json!({"tableID":id})).await?;
        h.send(1, "getGameInfo2", json!({"tableID":id})).await?;
        ensure!(
            h.receive(1, "chatList").await?["unread"] == 1,
            "Reconnect reset the chat read position"
        );
        h.send(1, "loaded", json!({"tableID":id})).await?;
        h.send(0, "tableTerminate", json!({"tableID":id})).await?;
        for index in 0..2 {
            h.barrier(index).await?;
            h.frames(index)?;
        }
        h.send(0, "tableRestart", json!({"tableID":id,"hidePregame":true}))
            .await?;
        let started = h.receive(0, "tableStart").await?;
        let remade = started["tableID"]
            .as_u64()
            .context("Missing remade table")?;
        ensure!(remade != id);
        for (index, read) in [alice_read, bob_read].into_iter().enumerate() {
            h.replace(index).await?;
            h.send(index, "tableReattend", json!({"tableID":remade}))
                .await?;
            h.send(index, "getGameInfo2", json!({"tableID":remade}))
                .await?;
            let history = h.receive(index, "chatList").await?;
            let total = history["list"].as_array().context("Missing history")?.len();
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
async fn pregame_history_survives_join_return_and_actor_recovery() -> Result<()> {
    let Some(mut h) = Harness::new(&["Alice", "Bob", "Outsider"]).await? else {
        return Ok(());
    };
    let result = async {
        let id = h.create(0, "Chat recovery", json!({})).await?;
        let room = format!("table{id}");
        h.send(0, "chat", json!({"room":room,"msg":"Before Bob joined"}))
            .await?;
        h.send(1, "tableJoin", json!({"tableID":id})).await?;
        let history = h.receive(1, "chatList").await?;
        ensure!(history["list"][0]["msg"] == "Before Bob joined");
        ensure!(history["list"][1]["msg"] == "Bob joined the game.");
        ensure!(history["list"][1]["source"] == "server");
        ensure!(
            chat_messages(&h.frames(0)?)
                .iter()
                .any(|m| m["msg"] == "Bob joined the game.")
        );
        h.send(1, "chat", json!({"room":room,"msg":"Bob's message"}))
            .await?;
        h.send(1, "tableUnattend", json!({"tableID":id})).await?;
        h.frames(1)?;
        h.send(0, "chat", json!({"room":room,"msg":"While Bob was away"}))
            .await?;
        h.send(1, "tableReattend", json!({"tableID":id})).await?;
        let history = h.receive(1, "chatList").await?;
        ensure!(history["list"].as_array().unwrap().len() == 4);
        ensure!(history["list"][3]["msg"] == "While Bob was away");
        h.send(1, "tableLeave", json!({"tableID":id})).await?;
        h.send(1, "tableJoin", json!({"tableID":id})).await?;
        let history = h.receive(1, "chatList").await?;
        ensure!(history["list"][4]["msg"] == "Bob left the game.");
        ensure!(history["list"][5]["msg"] == "Bob joined the game.");
        ensure!(
            h.frames(2)?
                .iter()
                .all(|(name, _)| name != "chat" && name != "chatList"),
            "Table chat leaked to an outsider"
        );
        let snapshot = h.snapshot(id).await?.0;
        ensure!(snapshot.chat.len() == 6 && snapshot.chat_archived == 6);
        let count: i64 = sqlx::query_scalar!(
            "SELECT count(*) AS \"v!\" FROM chat_log WHERE room=$1",
            &room
        )
        .fetch_one(&h.store.primary)
        .await?;
        ensure!(count == 6, "Pregame messages were not archived");
        h.restart().await?;
        h.send(0, "tableReattend", json!({"tableID":id})).await?;
        let restored = h.receive(0, "chatList").await?;
        ensure!(
            restored["list"] == history["list"],
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
            h.send(index, "tableJoin", json!({"tableID":id})).await?;
        }
        h.barrier(0).await?;
        for index in 0..3 {
            h.frames(index)?;
        }
        h.send(0, "tableSetLeader", json!({"tableID":id,"name":"Carol"}))
            .await?;
        for index in 0..3 {
            let game = h.receive(index, "game").await?;
            ensure!(game["owner"] == 3);
            let players = game["players"].as_array().context("Missing players")?;
            for (seat, name) in ["Carol", "Bob", "Alice"].iter().enumerate() {
                ensure!(
                    players[seat]["name"] == *name && players[seat]["index"] == seat,
                    "Leader transfer did not swap the new leader into the first seat"
                );
                ensure!(players[seat]["you"] == (*name == h.users[index].name));
            }
        }
        let expected = vec![3, 2, 1];
        ensure!(
            h.snapshot(id)
                .await?
                .0
                .players()
                .iter()
                .map(|p| p.id)
                .collect::<Vec<_>>()
                == expected,
            "Leader seating was not persisted"
        );
        h.send(2, "tableStart", json!({"tableID":id})).await?;
        let live_players = h
            .snapshot(id)
            .await?
            .0
            .players()
            .iter()
            .map(|p| p.id)
            .collect::<Vec<_>>();
        h.send(2, "tableSetLeader", json!({"tableID":id,"name":"Alice"}))
            .await?;
        let table = h.snapshot(id).await?.0;
        ensure!(table.owner == 1);
        ensure!(
            table.players().iter().map(|p| p.id).collect::<Vec<_>>() == live_players,
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
async fn finished_game_publishes_replay_leader_candidates_without_reconnecting() -> Result<()> {
    let Some(mut h) = Harness::new(&["Alice", "Bob", "Observer", "Outsider"]).await? else {
        return Ok(());
    };
    let result = async {
        let id = h.create(0, "Leader candidates", json!({})).await?;
        h.send(1, "tableJoin", json!({"tableID":id})).await?;
        h.send(0, "tableStart", json!({"tableID":id})).await?;
        h.send(2, "tableSpectate", json!({"tableID":id})).await?;
        for index in 0..3 {
            h.send(index, "loaded", json!({"tableID":id})).await?;
        }
        h.barrier(0).await?;
        for index in 0..4 {
            h.frames(index)?;
        }
        h.send(0, "tableTerminate", json!({"tableID":id})).await?;
        for index in 0..3 {
            ensure!(
                h.receive(index, "connected").await?["list"] == json!([true, true]),
                "Finished-game names must not be shown as disconnected"
            );
            let roster = h.receive(index, "spectators").await?;
            let names = roster["spectators"]
                .as_array()
                .context("Missing roster")?
                .iter()
                .map(|p| p["name"].as_str().unwrap())
                .collect::<std::collections::BTreeSet<_>>();
            ensure!(
                names == std::collections::BTreeSet::from(["Alice", "Bob", "Observer"]),
                "Finished-game players were missing from replay leader candidates"
            );
            let clock = h.receive(index, "clock").await?;
            ensure!(
                clock["activePlayerIndex"] == -1 && clock["timeTaken"] == 0,
                "Completion did not stop the active clock"
            );
        }
        ensure!(
            h.frames(3)?.iter().all(|(name, _)| name != "spectators"),
            "Replay roster was sent to a non-attendee"
        );
        h.send(0, "tableSetLeader", json!({"tableID":id,"name":"Bob"}))
            .await?;
        ensure!(h.receive(0, "replayLeader").await?["name"] == "Bob");
        ensure!(h.snapshot(id).await?.0.owner == 2);
        h.send(2, "tableUnattend", json!({"tableID":id})).await?;
        let roster = h.receive(0, "spectators").await?;
        ensure!(roster["spectators"].as_array().unwrap().len() == 2);
        ensure!(
            roster["spectators"]
                .as_array()
                .unwrap()
                .iter()
                .all(|p| p["name"] != "Observer"),
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
        h.send(0, "loaded", json!({"tableID":id})).await?;
        ensure!(h.receive(0, "connected").await?["list"] == json!([true, true]));
        h.barrier(0).await?;
        ensure!(h.frames(0)?.iter().all(|(command, _)| command != "clock"));
        tokio::time::sleep(Duration::from_millis(25)).await;
        h.send(
            0,
            "replayAction",
            json!({"tableID":id,"type":"segment","segment":0}),
        )
        .await?;
        let snapshot = h.snapshot(id).await?.0;
        let replay = snapshot.game().unwrap();
        let before = initial.game().unwrap();
        ensure!(!replay.timer_started && !replay.game.started_timer);
        ensure!(
            replay.clocks == before.clocks
                && replay.turn_elapsed == before.turn_elapsed
                && replay.duration == before.duration,
            "Replay navigation advanced game clocks"
        );
        h.send(1, "tableSpectate", json!({"tableID":id})).await?;
        h.send(1, "getGameInfo2", json!({"tableID":id})).await?;
        ensure!(h.receive(1, "connected").await?["list"] == json!([true, true]));
        h.send(1, "loaded", json!({"tableID":id})).await?;
        h.barrier(0).await?;
        for index in 0..2 {
            let frames = h.frames(index)?;
            ensure!(
                frames.iter().all(|(command, _)| command != "clock"),
                "Loading another replay viewer sent a live clock"
            );
            for (_, data) in frames.iter().filter(|(command, _)| command == "connected") {
                ensure!(data["list"] == json!([true, true]));
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
        .get("suggestedOptions")
        .cloned()
        .context("Missing actionable options")
}
async fn mark_complete(h: &Harness, user: i32, except: Option<&str>) -> Result<()> {
    let variants = hanabi_engine::variants()
        .iter()
        .filter(|v| Some(v.name.as_str()) != except)
        .collect::<Vec<_>>();
    sqlx::query!("INSERT INTO user_stats(user_id,variant_id,best_score2) SELECT $1,v.id,v.score FROM UNNEST($2::smallint[],$3::smallint[]) AS v(id,score) ON CONFLICT(user_id,variant_id) DO UPDATE SET best_score2=excluded.best_score2", user, &variants.iter().map(|v|i16::try_from(v.id)).collect::<Result<Vec<_>,_>>()?, &variants.iter().map(|v|i16::try_from(v.max_score)).collect::<Result<Vec<_>,_>>()?).execute(&h.store.primary).await?;
    Ok(())
}

#[tokio::test]
async fn pregame_total_counts_only_normal_non_speedrun_games() -> Result<()> {
    let Some(mut h) = Harness::new(&["Alice", "Bob"]).await? else {
        return Ok(());
    };
    let outcome = async {
        let games: Vec<i32> = sqlx::query_scalar!("INSERT INTO games(name,num_players,variant_id,timed,time_base,time_per_turn,
             speedrun,card_cycle,deck_plays,empty_clues,one_extra_card,one_less_card,
             all_or_nothing,detrimental_characters,seed,score,num_turns,end_condition,datetime_started,datetime_finished)
             SELECT 'Stats fixture',2,CASE WHEN n=2 THEN 1 ELSE 0 END,false,120,20,
             n IN (8,9),false,false,false,false,false,false,false,
             'stats-'||n,CASE WHEN n IN (1,8) THEN 25 ELSE 0 END,30,
             CASE n WHEN 3 THEN 2 WHEN 4 THEN 3 WHEN 5 THEN 4 WHEN 6 THEN 6
                    WHEN 7 THEN 10 WHEN 9 THEN 5 ELSE 1 END,NOW(),NOW()
             FROM generate_series(1,9) n ORDER BY n RETURNING id")
        .fetch_all(&h.store.primary)
        .await?;
        sqlx::query!("INSERT INTO game_participants(game_id,user_id,seat,character_assignment,character_metadata)
             SELECT id,1,0,0,0 FROM unnest($1::integer[]) games(id)", &games)
        .execute(&h.store.primary)
        .await?;
        let id = h.create(0, "Count parity", json!({})).await?;
        h.send(1, "tableJoin", json!({"tableID":id})).await?;
        let snapshot = h.snapshot(id).await?.0;
        let players = snapshot.players();
        ensure!(
            players.iter().find(|player| player.id == 1).context("Missing Alice")?.stats["numGames"] == 2,
            "Pregame total must count normal non-speedrun games across variants, including zero-score normal finishes"
        );
        ensure!(
            players.iter().find(|player| player.id == 2).context("Missing Bob")?.stats["numGames"] == 0,
            "Another player's history must not affect the total"
        );
        ensure!(
            crate::database::normal_game_count(&h.store.primary, 1, true).await? == 3,
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
        h.send(1, "tableJoin", json!({"tableID":id})).await?;
        let room = format!("table{id}");
        for running in [false, true] {
            if running {
                h.send(0, "tableStart", json!({"tableID":id})).await?;
                ensure!(matches!(h.snapshot(id).await?.0.phase, Phase::Live { .. }));
            }
            h.frames(0)?;
            h.frames(2)?;
            for (text, expected) in [
                ("/setall 11", "/setall 11"),
                ("/custom-bot <level>", "/custom-bot &lt;level&gt;"),
            ] {
                let before = h.snapshot(id).await?.0.chat.len();
                h.send(1, "chat", json!({"room":room,"msg":text})).await?;
                let messages = chat_messages(&h.frames(0)?);
                ensure!(
                    messages.iter().any(|message| message["msg"] == expected
                        && message["who"] == "Alice"
                        && message["source"] == "user"),
                    "Bot did not receive table command"
                );
                let snapshot = h.snapshot(id).await?.0;
                ensure!(
                    snapshot.chat.len() == before + 1,
                    "Command was not persisted"
                );
                ensure!(snapshot.chat[before].message["msg"] == expected);
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
            h.send(index, "tableJoin", json!({"tableID":id})).await?;
        }
        h.barrier(0).await?;
        for index in 0..4 {
            h.frames(index)?;
        }
        h.send(1, "tableUpdate", json!({
            "tableID":id,"name":"Proposal","maxPlayers":2,
            "options":{"variantName":"6 Suits","timed":true,"timeBase":120,"timePerTurn":20,"emptyClues":true}
        })).await?;
        h.barrier(0).await?;
        for index in 0..3 {
            let messages = chat_messages(&h.frames(index)?);
            let summary = messages.iter().find(|m| m.get("recipient").is_none()).context("Missing public summary")?;
            let text = summary["msg"].as_str().context("Missing summary text")?;
            for expected in ["Bob&lt;&amp;&gt; proposes the following options:", "Table Name: <b>Proposal</b>", "Variant: <b>6 Suits</b>", "Timed: <b>120 / 20</b>", "Max Players: <b>2</b>", "Empty Clues: <b>Yes</b>", "Players above the new limit will be removed."] {
                ensure!(text.contains(expected), "Missing proposal detail: {expected}");
            }
            ensure!(!text.contains("Speedrun:") && !text.contains("Card Cycling:"));
            let button = messages.iter().find(|m| m["msg"].as_str().is_some_and(|s| s.contains("new-options")));
            if index == 0 {
                let button = button.context("Owner is missing the apply button")?;
                ensure!(button["recipient"] == "Alice");
                let options = suggestion(button)?;
                ensure!(options["variantName"] == "6 Suits" && options["maxPlayers"] == 2 && options["tableName"] == "Proposal");
            } else {
                ensure!(button.is_none(), "Apply button leaked to a non-owner");
            }
        }
        ensure!(chat_messages(&h.frames(3)?).is_empty());
        let table = h.snapshot(id).await?.0;
        ensure!(table.options.variant_name == "No Variant" && table.name == "Original" && table.max_players == 5);
        let message = &table.chat.last().context("Summary was not persisted")?.message;
        ensure!(message["msg"].as_str().unwrap().contains("Variant: <b>6 Suits</b>"));
        ensure!(message.get("recipient").is_none());
        let before = table.chat.len();
        let error = h.send(1, "tableUpdate", json!({"tableID":id,"name":"Original","maxPlayers":5,"options":{}}))
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
async fn findvariant_delivers_owner_button_and_guards_the_start_action() -> Result<()> {
    let Some(mut h) = Harness::new(&["Alice", "Bob"]).await? else {
        return Ok(());
    };
    let outcome=async{
        mark_complete(&h,2,Some("Rainbow (5 Suits)")).await?;
        let id=h.create(0,"Team discovery",json!({"deckPlays":true,"oneExtraCard":true})).await?;
        h.send(1,"tableJoin",json!({"tableID":id})).await?;h.barrier(0).await?;
        h.frames(0)?;h.frames(1)?;
        h.send(1,"chat",json!({"room":format!("table{id}"),"msg":"/findvariant"})).await?;h.barrier(0).await?;
        let alice=chat_messages(&h.frames(0)?);let bob=chat_messages(&h.frames(1)?);
        let proposal=alice.iter().find(|v|v["msg"].as_str().is_some_and(|s|s.contains("new-options"))).context("Owner did not receive proposal")?;
        ensure!(proposal["recipient"]=="Alice","Proposal was not private");
        ensure!(!bob.iter().any(|v|v["msg"].as_str().is_some_and(|s|s.contains("new-options"))),"Non-owner received proposal");
        ensure!(bob.iter().any(|v|v["msg"]=="Here is a random variant that everyone needs the 2-player max score in: Rainbow (5 Suits)"),"Wrong team discovery result");
        let options=browser_json(suggestion(proposal)?);
        ensure!(options["variantName"]=="Rainbow (5 Suits)"&&options["tableName"]=="Team discovery"&&options["maxPlayers"]==5&&options["deckPlays"]==true&&options["oneExtraCard"]==true,"Proposal lost table settings");
        let (table,_)=h.snapshot(id).await?;
        ensure!(table.chat.iter().all(|c|!c.message["msg"].as_str().unwrap_or("").contains("new-options")),"Private proposal entered public history");
        h.send(0,"tableUpdate",json!({"tableID":id,"name":options["tableName"],"maxPlayers":options["maxPlayers"],"options":options})).await?;
        let before=h.snapshot(id).await?.1;
        for data in [
            json!({"tableID":id,"intendedPlayers":["Alice","Bob"],"intendedVariant":"No Variant"}),
            json!({"tableID":id,"intendedPlayers":["Alice","Cathy"],"intendedVariant":"Rainbow (5 Suits)"}),
        ]{h.send(0,"tableStart",data).await?;ensure!(h.snapshot(id).await?.1==before,"Stale start intent mutated the game");}
        h.send(0,"tableStart",json!({"tableID":id,"intendedPlayers":["Bob","Alice"],"intendedVariant":"Rainbow (5 Suits)"})).await?;
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
        h.send(1,"tableJoin",json!({"tableID":id})).await?;h.barrier(0).await?;
        for index in 0..3{h.frames(index)?;}
        let mut lock=h.store.primary.begin().await?;
        #[expect(clippy::disallowed_methods, reason = "test SQL that sets up database state or failures directly")]
        sqlx::query("LOCK TABLE user_stats IN ACCESS EXCLUSIVE MODE").execute(&mut *lock).await?;
        let finding=h.begin(1,"chat",json!({"room":format!("table{id}"),"msg":"/fv"})).await?;
        h.wait_locks(1).await?;
        h.send(0,"tableLeave",json!({"tableID":id})).await?;
        let joining=h.begin(2,"tableJoin",json!({"tableID":id})).await?;
        h.wait_locks(2).await?;lock.commit().await?;
        joining.await??;finding.await??;h.barrier(1).await?;
        let (table,_)=h.snapshot(id).await?;
        ensure!(table.players().iter().map(|p|p.id).collect::<Vec<_>>()==vec![2,3],"Concurrent roster change was blocked");
        for index in 0..3{
            let chats=chat_messages(&h.frames(index)?);
            ensure!(!chats.iter().any(|v|v["msg"].as_str().unwrap_or("").contains("new-options")),"Stale roster received an actionable proposal");
            if index==1{ensure!(chats.iter().any(|v|v["msg"]=="Here is a random variant that everyone needs the 2-player max score in: Rainbow (5 Suits)"),"Lookup did not preserve its captured team");}
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
        h.send(1, "tableJoin", json!({"tableID":id})).await?;
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
            .begin(1, "chat", json!({"room":format!("table{id}"),"msg":"/fv"}))
            .await?;
        h.wait_locks(1).await?;
        let (old, mut old_frames) = h.replace(0).await?;
        h.send(0, "tableReattend", json!({"tableID":id})).await?;
        lock.commit().await?;
        finding.await??;
        h.barrier(0).await?;
        ensure!(!old.active(), "Owner generation was not fenced");
        ensure!(
            chat_messages(&h.frames(0)?)
                .iter()
                .any(|v| v["recipient"] == "Alice"
                    && v["msg"].as_str().unwrap_or("").contains("new-options")),
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
                .any(|v| v["msg"].as_str().unwrap_or("").contains("new-options")),
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
        h.send(1, "tableJoin", json!({"tableID":id})).await?;
        h.send(0, "tableStart", json!({"tableID":id})).await?;
        h.barrier(0).await?;
        h.frames(0)?;
        h.frames(1)?;
        for _ in 0..2 {
            h.send(
                0,
                "tag",
                json!({"tableID":id,"room":format!("table{id}"),"msg":" ALPHA <b> "}),
            )
            .await?;
        }
        h.barrier(0).await?;
        let private = chat_messages(&h.frames(0)?);
        ensure!(
            private.len() == 2
                && private.iter().all(|v| v["msg"]
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
            h.send(1, "tagDelete", json!({"tableID":id,"msg":"alpha <b>"}))
                .await
                .is_err(),
            "Another author deleted a live tag"
        );
        h.send(0, "tableTerminate", json!({"tableID":id})).await?;
        h.barrier(0).await?;
        h.frames(0)?;
        h.frames(1)?;
        let game_id = h.snapshot(id).await?.0.game().unwrap().game_id;
        sqlx::query!(
            "INSERT INTO game_tags(game_id,user_id,tag) VALUES($1,2,'zeta'),($1,2,'alpha <b>')",
            game_id
        )
        .execute(&h.store.primary)
        .await?;
        for alias in ["/tags", "/taglist"] {
            h.send(0, "chat", json!({"room":format!("table{id}"),"msg":alias}))
                .await?;
            h.barrier(0).await?;
            for index in 0..2 {
                let chats = chat_messages(&h.frames(index)?);
                let lines = chats
                    .iter()
                    .map(|v| v["msg"].as_str().unwrap_or(""))
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
        h.send(1, "tagDelete", json!({"tableID":id,"msg":"zeta"}))
            .await?;
        h.barrier(0).await?;
        ensure!(
            chat_messages(&h.frames(0)?)
                .iter()
                .any(|v| v["msg"] == "Bob has deleted a game tag of \"zeta\"."),
            "Replay tag action was not published"
        );
        h.frames(1)?;
        h.send(0, "tagsDeleteAll", json!({"tableID":id})).await?;
        h.send(1, "tagsDeleteAll", json!({"tableID":id})).await?;
        h.barrier(0).await?;
        h.frames(0)?;
        h.frames(1)?;
        h.send(
            1,
            "chat",
            json!({"room":format!("table{id}"),"msg":"/tags"}),
        )
        .await?;
        h.barrier(0).await?;
        ensure!(
            chat_messages(&h.frames(0)?)
                .iter()
                .map(|v| v["msg"].as_str().unwrap_or(""))
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
            json!({"tableID":replay_id,"type":"segment","segment":1}),
        )
        .await?;
        h.send(0, "tableUnattend", json!({"tableID":pregame}))
            .await?;
        ensure!(
            h.send(
                0,
                "tableCreate",
                json!({"name":"second human game","options":{}})
            )
            .await
            .is_err(),
            "Unattending bypassed single-playing restriction"
        );
        h.send(0, "tableReattend", json!({"tableID":pregame}))
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
        h.send(3, "tableReattend", json!({"tableID":bot_one}))
            .await?;
        h.send(3, "tableReattend", json!({"tableID":bot_two}))
            .await?;
        let (old_alice, _old_frames) = h.replace(0).await?;
        ensure!(!old_alice.active(), "Human replacement was not fenced");
        h.send(0, "tableReattend", json!({"tableID":pregame}))
            .await?;
        h.send(0, "tableSpectate", json!({"tableID":replay_id}))
            .await?;
        let (reply, replied) = oneshot::channel();
        h.hub
            .send(HubCommand::Client {
                session: old_alice,
                message: client_message(
                    "replayAction",
                    &json!({"tableID":replay_id,"type":"segment","segment":9}),
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
            h.snapshot(bot_one).await?.0.players()[0].id == 4
                && h.snapshot(bot_two).await?.0.players()[0].id == 4,
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
        let mut control = redis::Client::open(h.redis.url.as_str())?
            .get_multiplexed_async_connection()
            .await?;
        redis::cmd("CLIENT")
            .arg(&["PAUSE", "1500", "WRITE"])
            .query_async::<String>(&mut control)
            .await?;
        let joining = h.begin(1, "tableJoin", json!({"tableID":first})).await?;
        tokio::time::timeout(Duration::from_secs(2), async {
            loop {
                let clients: String = redis::cmd("CLIENT")
                    .arg("LIST")
                    .query_async(&mut control)
                    .await?;
                if clients.lines().any(|line| {
                    line.contains("name=hanabi-state")
                        && line.split_whitespace().any(|field| {
                            field
                                .strip_prefix("flags=")
                                .is_some_and(|flags| flags.contains('b'))
                        })
                }) {
                    return Ok::<(), anyhow::Error>(());
                }
                tokio::time::sleep(Duration::from_millis(10)).await;
            }
        })
        .await??;
        let (old, mut old_frames) = h.replace(1).await?;
        ensure!(!old.active(), "Old joining generation remained active");
        ensure!(
            h.send(1, "tableJoin", json!({"tableID":second}))
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
                json!({"name":"racing creation","options":{}})
            )
            .await
            .unwrap_err()
            .to_string()
            .contains("pending"),
            "Replacement bypassed pending create restriction"
        );
        joining.await??;
        h.barrier(1).await?;
        ensure!(
            h.snapshot(first)
                .await?
                .0
                .players()
                .iter()
                .any(|p| p.id == 2),
            "Accepted old-generation join was lost"
        );
        ensure!(
            h.send(1, "tableJoin", json!({"tableID":second}))
                .await
                .unwrap_err()
                .to_string()
                .contains("more than one"),
            "Claim released before committed membership publication"
        );
        h.send(1, "tableReattend", json!({"tableID":first})).await?;
        h.barrier(1).await?;
        while let Ok(frame) = old_frames.try_recv() {
            ensure!(
                !frame.message.to_text()?.starts_with("joined "),
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
            let (session, receiver) = Session::with_health(
                crate::transport::SessionMetadata {
                    user,
                    name: name.into(),
                    normalized_name: crate::accounts::normalize_username(name),
                    ip: ip.into(),
                    generation: 1,
                    hyphenated: false,
                },
                tokio_util::sync::CancellationToken::new(),
                Arc::new(|| true),
            );
            h.register(session.clone()).await?;
            sessions.push(session);
            outgoing.push(receiver);
        }
        let (reply, replied) = oneshot::channel();
        h.hub
            .send(HubCommand::Operations {
                command: Operation::Ban {
                    user_id: 1,
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
        h.send(0, "loaded", json!({"tableID":id})).await?;
        for (kind, extra) in [
            ("arrow", json!({"order":0})),
            ("sound", json!({"sound":"clap"})),
        ] {
            let mut data = json!({"tableID":id,"type":kind});
            data.as_object_mut()
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
            json!({"tableID":id,"type":"segment","segment":1}),
        )
        .await?;
        let (table, saved) = h.snapshot(id).await?;
        ensure!(saved > revision, "A segment change was not saved");
        let Phase::Replay { replay, .. } = &table.phase else {
            bail!("Not a replay");
        };
        ensure!(replay.segment == 1, "The saved segment is stale");
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
        h.send(1, "tableJoin", json!({"tableID":id})).await?;
        let room = format!("table{id}");
        for (command, expected) in [
            ("/replay 5 3", "http://localhost/replay/5#3"),
            ("/missing", "http://localhost/shared-missing-scores/2/"),
        ] {
            h.barrier(0).await?;
            h.frames(0)?;
            h.send(0, "chat", json!({"msg":command,"room":room}))
                .await?;
            h.barrier(0).await?;
            let messages = chat_messages(&h.frames(0)?);
            ensure!(
                messages
                    .iter()
                    .any(|m| m["msg"].as_str().is_some_and(|msg| msg.contains(expected))),
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
        h.send(1, "tableJoin", json!({"tableID":id})).await?;
        let room = format!("table{id}");
        for index in 0..TABLE_CHAT_LIMIT {
            h.send(
                0,
                "chat",
                json!({"room":room,"msg":format!("Message {index}")}),
            )
            .await?;
        }
        let refused = h
            .send(0, "chat", json!({"room":room,"msg":"One too many"}))
            .await
            .expect_err("Chat past the limit was accepted");
        ensure!(
            refused.to_string().contains("too quickly"),
            "Unexpected refusal: {refused:#}"
        );
        h.send(
            1,
            "chat",
            json!({"room":room,"msg":"Players have separate limits"}),
        )
        .await?;
        Ok(())
    }
    .await;
    h.close().await?;
    outcome
}
