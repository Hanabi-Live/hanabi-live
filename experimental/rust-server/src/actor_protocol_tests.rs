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
    _redis: RedisFixture,
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
        sqlx::query(sqlx::AssertSqlSafe(format!("CREATE DATABASE {database}")))
            .execute(&admin)
            .await?;
        let pool = PgPoolOptions::new()
            .max_connections(8)
            .connect_with(options.database(&database))
            .await?;
        sqlx::raw_sql(include_str!("../../../install/database_schema.sql"))
            .execute(&pool)
            .await?;
        for (index, name) in names.iter().enumerate() {
            sqlx::query("INSERT INTO users(id,username,normalized_username,password_hash,last_ip) VALUES($1,$2,$3,'fixture','127.0.0.1')")
                .bind(index as i32+1).bind(name).bind(crate::accounts::normalize_username(name)).execute(&pool).await?;
        }
        let redis = RedisFixture::start(true).await?;
        let state = RedisState::connect(&redis.url, "actor-protocol").await?;
        let store = Store::fixture(pool, state.clone());
        let tasks = TaskTracker::new();
        let hub = Hub::start(
            store.clone(),
            Arc::new(vec!["alpha".into(), "beta".into(), "gamma".into()]),
            tasks.clone(),
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
            _redis: redis,
        };
        for (index, name) in names.iter().enumerate() {
            let (session, outgoing) = Session::new(index as i32 + 1, (*name).into(), 1, false);
            h.register(session.clone()).await?;
            h.users.push(session);
            h.outgoing.push(outgoing);
        }
        Ok(Some(h))
    }
    async fn register(&self, session: Arc<Session>) -> Result<()> {
        let (reply, received) = oneshot::channel();
        self.hub
            .send(HubCommand::Register {
                session,
                welcome: json!({}),
                initial: vec![],
                reply,
            })
            .await?;
        received.await?
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
        let (reply, received) = oneshot::channel();
        self.hub
            .send(HubCommand::Client {
                session: self.users[index].clone(),
                command: command.into(),
                data,
                reply,
            })
            .await?;
        Ok(received)
    }
    async fn send(&self, index: usize, command: &str, data: Value) -> Result<()> {
        tokio::time::timeout(
            Duration::from_secs(10),
            self.begin(index, command, data).await?,
        )
        .await??
    }
    async fn barrier(&self, index: usize) -> Result<()> {
        let (reply, received) = oneshot::channel();
        self.hub
            .send(HubCommand::Directory {
                session: self.users[index].clone(),
                reply,
            })
            .await?;
        received.await??;
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
                let waiting:i64=sqlx::query_scalar("SELECT count(*) FROM pg_stat_activity WHERE datname=current_database() AND wait_event_type='Lock' AND query LIKE '%user_stats%'").fetch_one(&self.store.primary).await?;
                if waiting>=count{return Ok::<(),anyhow::Error>(());}
                tokio::time::sleep(Duration::from_millis(10)).await;
            }
        }).await?
    }
    async fn stop_hub(&self) -> Result<()> {
        let (reply, received) = oneshot::channel();
        self.hub.send(HubCommand::Quiesce(reply)).await?;
        for handle in received.await? {
            let (reply, received) = oneshot::channel();
            if handle.sender.send(TableCommand::Drain(reply)).await.is_ok() {
                tokio::time::timeout(Duration::from_secs(10), received).await???;
            }
        }
        let (reply, received) = oneshot::channel();
        self.hub.send(HubCommand::Stop(reply)).await?;
        received.await?;
        self.tasks.close();
        self.tasks.wait().await;
        Ok(())
    }
    async fn restart(&mut self) -> Result<()> {
        self.stop_hub().await?;
        self.tasks = TaskTracker::new();
        self.hub = Hub::start(
            self.store.clone(),
            Arc::new(vec!["alpha".into(), "beta".into(), "gamma".into()]),
            self.tasks.clone(),
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
        let count: i64 = sqlx::query_scalar("SELECT count(*) FROM chat_log WHERE room=$1")
            .bind(&room)
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
            json!({"tableID":id,"type":0,"segment":0}),
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

fn suggestion(value: &Value) -> Result<Value> {
    let text = value["msg"].as_str().context("Missing suggestion")?;
    let encoded = text
        .split("data-new-options=\"")
        .nth(1)
        .and_then(|s| s.split('"').next())
        .context("Missing actionable options button")?;
    let decoded = encoded
        .replace("&quot;", "\"")
        .replace("&#39;", "'")
        .replace("&lt;", "<")
        .replace("&gt;", ">")
        .replace("&amp;", "&")
        .replace('\'', "\"");
    Ok(serde_json::from_str(&decoded)?)
}
async fn mark_complete(h: &Harness, user: i32, except: Option<&str>) -> Result<()> {
    let variants = hanabi_engine::variants()
        .iter()
        .filter(|v| Some(v.name.as_str()) != except)
        .collect::<Vec<_>>();
    sqlx::query("INSERT INTO user_stats(user_id,variant_id,best_score2) SELECT $1,v.id,v.score FROM UNNEST($2::smallint[],$3::smallint[]) AS v(id,score) ON CONFLICT(user_id,variant_id) DO UPDATE SET best_score2=excluded.best_score2")
        .bind(user).bind(variants.iter().map(|v|v.id as i16).collect::<Vec<_>>()).bind(variants.iter().map(|v|v.max_score as i16).collect::<Vec<_>>()).execute(&h.store.primary).await?;
    Ok(())
}

#[tokio::test]
async fn pregame_total_counts_only_normal_non_speedrun_games() -> Result<()> {
    let Some(mut h) = Harness::new(&["Alice", "Bob"]).await? else {
        return Ok(());
    };
    let outcome = async {
        let games: Vec<i32> = sqlx::query_scalar(
            "INSERT INTO games(name,num_players,variant_id,timed,time_base,time_per_turn,
             speedrun,card_cycle,deck_plays,empty_clues,one_extra_card,one_less_card,
             all_or_nothing,detrimental_characters,seed,score,num_turns,end_condition,datetime_started,datetime_finished)
             SELECT 'Stats fixture',2,CASE WHEN n=2 THEN 1 ELSE 0 END,false,120,20,
             n IN (8,9),false,false,false,false,false,false,false,
             'stats-'||n,CASE WHEN n IN (1,8) THEN 25 ELSE 0 END,30,
             CASE n WHEN 3 THEN 2 WHEN 4 THEN 3 WHEN 5 THEN 4 WHEN 6 THEN 6
                    WHEN 7 THEN 10 WHEN 9 THEN 5 ELSE 1 END,NOW(),NOW()
             FROM generate_series(1,9) n ORDER BY n RETURNING id",
        )
        .fetch_all(&h.store.primary)
        .await?;
        sqlx::query(
            "INSERT INTO game_participants(game_id,user_id,seat,character_assignment,character_metadata)
             SELECT id,1,0,0,0 FROM unnest($1::integer[]) games(id)",
        )
        .bind(games)
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
        let options=suggestion(proposal)?;
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
            "Live tag acknowledgements differ from Go"
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
        sqlx::query(
            "INSERT INTO game_tags(game_id,user_id,tag) VALUES($1,2,'zeta'),($1,2,'alpha <b>')",
        )
        .bind(game_id)
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
        let leaked: i64 = sqlx::query_scalar(
            "SELECT count(*) FROM chat_log WHERE message LIKE 'Successfully%tag%'",
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
        let replay = h.replay(0).await?;
        let pregame = h.create(0, "Concurrent pregame", json!({})).await?;
        ensure!(
            matches!(h.snapshot(replay).await?.0.phase, Phase::Replay { .. })
                && matches!(h.snapshot(pregame).await?.0.phase, Phase::Pregame { .. }),
            "Creation evicted the attended replay"
        );
        h.send(
            0,
            "replayAction",
            json!({"tableID":replay,"type":0,"segment":1}),
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
        h.send(0, "tableSpectate", json!({"tableID":replay}))
            .await?;
        let (reply, received) = oneshot::channel();
        h.hub
            .send(HubCommand::Client {
                session: old_alice,
                command: "replayAction".into(),
                data: json!({"tableID":replay,"type":0,"segment":9}),
                reply,
            })
            .await?;
        ensure!(
            received.await?.is_err(),
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
        let mut control = redis::Client::open(h._redis.url.as_str())?
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
async fn paused_clock_survives_deadline_then_unpaused_disconnected_player_times_out_durably()
-> Result<()> {
    let Some(mut h) = Harness::new(&["Alice", "Bob"]).await? else {
        return Ok(());
    };
    let outcome = async {
        let id = h
            .create(
                0,
                "Timer regression",
                json!({"timed":true,"timeBase":5,"timePerTurn":1}),
            )
            .await?;
        h.send(1, "tableJoin", json!({"tableID":id})).await?;
        h.send(0, "tableStart", json!({"tableID":id})).await?;
        for index in 0..2 {
            h.send(index, "loaded", json!({"tableID":id})).await?;
        }
        let (initial, _) = h.snapshot(id).await?;
        let game = initial.game().unwrap();
        let active = game.game.active_player_index;
        let actor = game.players[active].id as usize - 1;
        let remaining = 1 - actor;
        let game_id = game.game_id;
        h.send(actor, "pause", json!({"tableID":id,"setting":"pause"}))
            .await?;
        tokio::time::sleep(Duration::from_secs(6)).await;
        let (paused, _) = h.snapshot(id).await?;
        ensure!(
            matches!(paused.phase, Phase::Live { .. }) && paused.game().unwrap().game.paused,
            "Paused game expired at its original deadline"
        );
        let archived: bool = sqlx::query_scalar("SELECT EXISTS(SELECT 1 FROM games WHERE id=$1)")
            .bind(game_id)
            .fetch_one(&h.store.primary)
            .await?;
        ensure!(!archived, "Paused game was prematurely archived");
        h.send(actor, "pause", json!({"tableID":id,"setting":"unpause"}))
            .await?;
        h.hub
            .send(HubCommand::Logout(h.users[actor].clone()))
            .await?;
        h.barrier(remaining).await?;
        ensure!(
            !h.users[actor].active() && h.users[remaining].active(),
            "Active-player disconnect was not established"
        );
        let finish = h.receive(remaining, "finishOngoingGame").await?;
        ensure!(finish["tableID"] == id, "Wrong game finished");
        let (ended, _) = h.snapshot(id).await?;
        let game = ended.game().unwrap();
        ensure!(
            matches!(ended.phase, Phase::Replay { .. })
                && game.game.end_condition == EndCondition::Timeout
                && game.clocks[active] == 0,
            "Timeout was not durably finalized"
        );
        let condition: i16 = sqlx::query_scalar("SELECT end_condition FROM games WHERE id=$1")
            .bind(game_id)
            .fetch_one(&h.store.primary)
            .await?;
        ensure!(
            condition == EndCondition::Timeout as i16,
            "Timeout did not reach the atomic PostgreSQL archive"
        );
        Ok::<(), anyhow::Error>(())
    }
    .await;
    h.close().await?;
    outcome
}
