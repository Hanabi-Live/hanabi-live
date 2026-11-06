use crate::{
    game::{Action, Card, Game, Options},
    lobby::{Effect, OnlineUser},
    model::{Phase, *},
    operations::Operation,
    store::Store,
    transport::{Session, frame},
};
use anyhow::{Context, Result, bail, ensure};
use chrono::{Duration as ChronoDuration, Utc};
use hanabi_engine::{CompletionTiming, EndCondition, GameSetup, Interpretation, Recipient};
use hanabi_protocol::{Chat, ChatSource, ChatTyping, TableId, TableRequest, TableStarted};
use serde::Serialize;
use serde_json::{Value, json};
use std::{
    collections::{BTreeMap, HashMap, HashSet},
    sync::{Arc, Mutex},
    time::{Duration, Instant},
};
use tokio::sync::{Notify, OwnedSemaphorePermit, Semaphore, mpsc, oneshot};
use tokio_util::task::TaskTracker;

#[cfg(test)]
#[path = "actor_protocol_tests.rs"]
mod protocol_tests;
#[path = "table_replay.rs"]
mod replay_helpers;
#[cfg(test)]
#[path = "actor_tests.rs"]
mod tests;
type Reply = oneshot::Sender<Result<()>>;

const PREGAME_RECONNECT_GRACE: Duration = Duration::from_secs(60);

#[derive(Serialize)]
struct GameActionMessage<'a> {
    #[serde(rename = "tableID")]
    table_id: u64,
    action: &'a hanabi_engine::EngineEvent,
}

#[derive(Serialize)]
struct GameActionListMessage<'a> {
    #[serde(rename = "tableID")]
    table_id: u64,
    list: &'a [hanabi_engine::EngineEvent],
}

pub struct Allocation {
    pub id: u64,
    permit: Option<OwnedSemaphorePermit>,
    cleanup: Option<(Store, TaskTracker)>,
    revision: i64,
    playing_claims: Vec<PlayingClaim>,
}
pub struct PlayingClaim {
    users: Arc<Mutex<HashSet<i32>>>,
    user: i32,
}
impl PlayingClaim {
    fn acquire(users: &Arc<Mutex<HashSet<i32>>>, user: i32) -> Result<Self> {
        ensure!(
            users.lock().unwrap_or_else(|e| e.into_inner()).insert(user),
            "Another playing-table request is already pending."
        );
        Ok(Self {
            users: users.clone(),
            user,
        })
    }
}
impl Drop for PlayingClaim {
    fn drop(&mut self) {
        self.users
            .lock()
            .unwrap_or_else(|e| e.into_inner())
            .remove(&self.user);
    }
}
impl Allocation {
    fn new(
        id: u64,
        permit: OwnedSemaphorePermit,
        store: Store,
        tasks: TaskTracker,
        revision: i64,
    ) -> Self {
        Self {
            id,
            permit: Some(permit),
            cleanup: Some((store, tasks)),
            revision,
            playing_claims: vec![],
        }
    }
    fn into_permit(mut self) -> OwnedSemaphorePermit {
        self.cleanup = None;
        self.permit.take().expect("owned allocation permit")
    }
    fn preserve(&mut self) {
        self.cleanup = None;
    }
}
impl Drop for Allocation {
    fn drop(&mut self) {
        if let Some((store, tasks)) = self.cleanup.take() {
            let id = self.id;
            let revision = self.revision;
            let permit = self.permit.take();
            let playing_claims = std::mem::take(&mut self.playing_claims);
            tasks.spawn(async move {
                if let Err(error) = store.remove(id, revision).await {
                    eprintln!("Uninstalled table {id} cleanup failed: {error}");
                }
                drop(permit);
                drop(playing_claims);
            });
        }
    }
}
#[derive(Clone, PartialEq)]
pub struct TableView {
    players: Vec<i32>,
    replay: bool,
    visible: bool,
    data: Value,
    inspection: Value,
    reconnects: BTreeMap<i32, Option<i32>>,
}
#[derive(Clone)]
pub struct TableHandle {
    pub sender: mpsc::Sender<TableCommand>,
    pub cleanup: Arc<Notify>,
}
struct Entry {
    handle: TableHandle,
    view: TableView,
    published: bool,
}
struct Presence {
    session: Arc<Session>,
    status: u8,
    table: Option<u64>,
}
pub struct Effects {
    pub table: u64,
    pub view: TableView,
    pub statuses: Vec<(Arc<Session>, u8, Option<u64>)>,
    pub messages: Vec<(Arc<Session>, String)>,
}
pub enum HubCommand {
    Register {
        session: Arc<Session>,
        welcome: Value,
        initial: Vec<String>,
        reply: Reply,
    },
    Logout(Arc<Session>),
    Create {
        session: Arc<Session>,
        player: Player,
        name: String,
        deck: Option<Vec<Card>>,
        reply: Reply,
    },
    CreateConfigured {
        session: Arc<Session>,
        player: Player,
        name: String,
        options: Options,
        extra: Box<ExtraOptions>,
        reply: Reply,
    },
    Allocate(oneshot::Sender<Result<Allocation>>),
    Replay {
        session: Arc<Session>,
        snapshot: Box<Snapshot>,
        allocation: Allocation,
        reply: Reply,
    },
    Client {
        session: Arc<Session>,
        command: String,
        data: Value,
        reply: Reply,
    },
    Directory {
        session: Arc<Session>,
        reply: oneshot::Sender<Result<Vec<OnlineUser>>>,
    },
    LobbyEffects {
        session: Arc<Session>,
        effects: Vec<Effect>,
        reply: Reply,
    },
    ExternalEffects {
        effects: Vec<Effect>,
        reply: Reply,
    },
    PlayingFinished {
        result: Result<()>,
        reply: Reply,
        claim: PlayingClaim,
    },
    CheckPlaying {
        users: Vec<i32>,
        except: u64,
        reply: Reply,
    },
    Operations {
        command: Operation,
        reply: oneshot::Sender<Result<Value>>,
    },
    Route {
        session: Arc<Session>,
        table: u64,
        command: Command,
        reply: Reply,
    },
    Sync {
        session: Arc<Session>,
        reply: Reply,
    },
    Effects(Effects),
    Retire(u64),
    Install {
        table: Box<TableSnapshot>,
        revision: i64,
        allocation: Allocation,
        session: Arc<Session>,
        warnings: Vec<String>,
        reply: Reply,
    },
    Spawn {
        table: Box<TableSnapshot>,
        revision: i64,
        allocation: Allocation,
        attendees: Vec<(Arc<Session>, bool, Option<usize>)>,
        chat_read: HashMap<i32, usize>,
    },
    Quiesce(oneshot::Sender<Vec<TableHandle>>),
    Stop(oneshot::Sender<()>),
}
pub enum Command {
    Join(Player),
    Start(Option<String>),
    Loaded(Option<String>),
    Action(Action, Option<String>),
    Info(u8),
    Reattend,
    Unattend,
    Wire { name: String, data: Value },
}
pub enum TableCommand {
    Client {
        session: Arc<Session>,
        command: Command,
        reply: Reply,
    },
    Drain(oneshot::Sender<Result<()>>),
    Operation {
        operation: TableOperation,
        reply: oneshot::Sender<Result<Value>>,
    },
}
pub enum TableOperation {
    Notice(String),
    Terminate,
    Clear { pregames: bool, empty: bool },
    Kick(i32),
}
pub struct Hub {
    receiver: mpsc::Receiver<HubCommand>,
    sender: mpsc::Sender<HubCommand>,
    sessions: HashMap<i32, Presence>,
    tables: HashMap<u64, Entry>,
    closing: bool,
    maintenance: bool,
    shutdown_imminent: bool,
    store: Store,
    tasks: TaskTracker,
    capacity: Arc<Semaphore>,
    playing_claims: Arc<Mutex<HashSet<i32>>>,
}
impl Hub {
    pub async fn start(store: Store, tasks: TaskTracker) -> Result<mpsc::Sender<HubCommand>> {
        let restored = store.load_for_startup().await?;
        let (sender, receiver) = mpsc::channel(512);
        let mut hub = Self {
            receiver,
            sender: sender.clone(),
            sessions: HashMap::new(),
            tables: HashMap::new(),
            closing: false,
            maintenance: false,
            shutdown_imminent: false,
            store,
            tasks: tasks.clone(),
            capacity: Arc::new(Semaphore::new(256)),
            playing_claims: Arc::new(Mutex::new(HashSet::new())),
        };
        for (table, revision) in restored {
            let permit = hub
                .capacity
                .clone()
                .try_acquire_owned()
                .context("Recovery table capacity exhausted")?;
            let actor = TableActor::new(table, revision, hub.store.clone(), sender.clone(), permit);
            let id = actor.table.id;
            let view = actor.view();
            let handle = hub.spawn(actor, None);
            hub.tables.insert(
                id,
                Entry {
                    handle,
                    view,
                    published: true,
                },
            );
        }
        tasks.spawn(hub.run());
        Ok(sender)
    }
    fn spawn(
        &self,
        mut actor: TableActor,
        initial: Option<(Arc<Session>, Vec<String>, Reply)>,
    ) -> TableHandle {
        let (sender, receiver) = mpsc::channel(64);
        actor.playing_claims = self.playing_claims.clone();
        let handle = TableHandle {
            sender,
            cleanup: actor.cleanup.clone(),
        };
        self.tasks.spawn(actor.run(receiver, initial));
        handle
    }
    fn current(&self, s: &Session) -> bool {
        self.store.check_state().is_ok()
            && s.active()
            && self
                .sessions
                .get(&s.user)
                .is_some_and(|p| p.session.generation == s.generation)
    }
    fn user(p: &Presence) -> Value {
        let mut v = json!({"userID":p.session.user,"name":p.session.name,"status":p.status,"hyphenated":p.session.hyphenated(),"inactive":p.session.inactive()});
        if p.status == 4 {
            v["tableID"] = json!(0);
        } else if let Some(id) = p.table {
            v["tableID"] = json!(id);
        }
        v
    }
    fn broadcast(&self, message: &str) {
        if self.store.check_state().is_ok() {
            for p in self.sessions.values() {
                if self.current(&p.session) {
                    p.session.emit(message);
                }
            }
        }
    }
    fn table_for(v: &TableView, user: i32) -> Value {
        let mut data = v.data.clone();
        data["joined"] = json!(v.players.contains(&user));
        data
    }
    fn playing_elsewhere(&self, user: i32, except: Option<u64>) -> bool {
        self.tables.iter().any(|(id, entry)| {
            Some(*id) != except && !entry.view.replay && entry.view.players.contains(&user)
        })
    }
    fn route(&self, s: Arc<Session>, id: u64, command: Command, reply: Reply) {
        if self.closing || !self.current(&s) {
            let _ = reply.send(Err(anyhow::anyhow!("Stale session or draining server")));
            return;
        }
        let joining = matches!(&command, Command::Join(_))
            || matches!(&command,Command::Wire{name,..} if name=="tableJoin");
        if joining && !s.name.starts_with("Bot-") && self.playing_elsewhere(s.user, Some(id)) {
            let _ = reply.send(Err(anyhow::anyhow!(
                "You cannot join more than one table at a time. Terminate your other game before joining a new one."
            )));
            return;
        }
        if let Some(entry) = self.tables.get(&id) {
            if joining && !s.name.starts_with("Bot-") {
                let claim = match PlayingClaim::acquire(&self.playing_claims, s.user) {
                    Ok(claim) => claim,
                    Err(error) => {
                        let _ = reply.send(Err(error));
                        return;
                    }
                };
                let (completed, received) = oneshot::channel();
                if entry
                    .handle
                    .sender
                    .try_send(TableCommand::Client {
                        session: s,
                        command,
                        reply: completed,
                    })
                    .is_err()
                {
                    let _ = reply.send(Err(anyhow::anyhow!("Table queue unavailable")));
                    return;
                }
                let hub = self.sender.clone();
                self.tasks.spawn(async move {
                    let result = received
                        .await
                        .unwrap_or_else(|_| Err(anyhow::anyhow!("Table closed")));
                    if let Err(error) = hub
                        .send(HubCommand::PlayingFinished {
                            result,
                            reply,
                            claim,
                        })
                        .await
                        && let HubCommand::PlayingFinished { reply, .. } = error.0
                    {
                        let _ = reply.send(Err(anyhow::anyhow!("Coordinator stopped")));
                    }
                });
                return;
            }
            if let Err(e) = entry.handle.sender.try_send(TableCommand::Client {
                session: s,
                command,
                reply,
            }) && let TableCommand::Client { reply, .. } = e.into_inner()
            {
                let _ = reply.send(Err(anyhow::anyhow!("Table queue unavailable")));
            }
        } else {
            let _ = reply.send(Err(anyhow::anyhow!("Unknown table")));
        }
    }
    fn create(&self, s: Arc<Session>, command: String, data: Value, reply: Reply) {
        if self.closing || self.maintenance || self.shutdown_imminent || !self.current(&s) {
            let message = if self.maintenance {
                "The server is undergoing maintenance."
            } else if self.closing || self.shutdown_imminent {
                "The server is shutting down."
            } else {
                "Your session is no longer current."
            };
            let _ = reply.send(Err(anyhow::anyhow!(message)));
            return;
        }
        let playing = command == "tableCreate" && !s.name.starts_with("Bot-");
        if playing && self.playing_elsewhere(s.user, None) {
            let _ = reply.send(Err(anyhow::anyhow!("You cannot join more than one table at a time. Terminate your other game before creating a new one.")));
            return;
        }
        let playing_claim = if playing {
            match PlayingClaim::acquire(&self.playing_claims, s.user) {
                Ok(claim) => Some(claim),
                Err(error) => {
                    let _ = reply.send(Err(error));
                    return;
                }
            }
        } else {
            None
        };
        let permit = match self.capacity.clone().try_acquire_owned() {
            Ok(p) => p,
            Err(e) => {
                let _ = reply.send(Err(e.into()));
                return;
            }
        };
        let store = self.store.clone();
        let hub = self.sender.clone();
        let tasks = self.tasks.clone();
        self.tasks.spawn(async move {
            let prepared = prepare_table(&store, &s, &command, data).await;
            match prepared {
                Ok((table, revision, warnings)) => {
                    let id = table.id;
                    let mut allocation =
                        Allocation::new(id, permit, store.clone(), tasks, revision);
                    if let Some(claim) = playing_claim {
                        allocation.playing_claims.push(claim);
                    }
                    let installed = HubCommand::Install {
                        table: Box::new(table),
                        revision,
                        allocation,
                        session: s,
                        warnings,
                        reply,
                    };
                    if let Err(e) = hub.send(installed).await
                        && let HubCommand::Install { reply, .. } = e.0
                    {
                        let _ = reply.send(Err(anyhow::anyhow!(
                            "Coordinator stopped; table is recoverable"
                        )));
                    }
                }
                Err(error) => {
                    let _ = reply.send(Err(error));
                }
            }
        });
    }
    fn apply_effects(
        &mut self,
        session: Option<&Arc<Session>>,
        effects: Vec<Effect>,
    ) -> Result<()> {
        self.store.check_state()?;
        if let Some(s) = session {
            ensure!(self.current(s), "Stale session");
        }
        for effect in effects {
            match effect {
                Effect::Broadcast { command, data } => self.broadcast(&frame(&command, data)),
                Effect::ToSelf { command, data } => {
                    let s = session.context("External effects must be public")?;
                    s.emit(&frame(&command, data));
                }
                Effect::ToUser {
                    id,
                    generation,
                    command,
                    data,
                } => {
                    ensure!(session.is_some(), "External private effect rejected");
                    if let Some(p) = self
                        .sessions
                        .get(&id)
                        .filter(|p| p.session.generation == generation && p.session.active())
                    {
                        p.session.emit(&frame(&command, data));
                    }
                }
                Effect::Hyphenated(value) => {
                    let s = session.context("Missing session")?;
                    s.set_hyphenated(value);
                    if let Some(p) = self.sessions.get(&s.user) {
                        self.broadcast(&frame("user", Self::user(p)));
                    }
                }
                Effect::Inactive(value) => {
                    let s = session.context("Missing session")?;
                    s.set_inactive(value);
                    if let Some(p) = self.sessions.get(&s.user) {
                        self.broadcast(&frame("user", Self::user(p)));
                    }
                }
                Effect::RelationshipChanged { .. } => {
                    ensure!(session.is_some(), "External relationship effect rejected");
                }
                _ => bail!("Runtime effects must be resolved before hub publication"),
            }
        }
        Ok(())
    }
    fn operations(&mut self, command: Operation, reply: oneshot::Sender<Result<Value>>) {
        if let Err(error) = self.store.check_state() {
            let _ = reply.send(Err(error));
            return;
        }
        if let Operation::Drained { reconnect } = command {
            let messages = [
                frame("soundLobby", json!({"file":"shutdown"})),
                if reconnect {
                    frame("restart", json!({}))
                } else {
                    frame(
                        "error",
                        json!({"error":"The server is going down for maintenance. Your accepted game progress has been saved.<br />Please reconnect after the server restarts."}),
                    )
                },
            ];
            let total = self.sessions.len();
            let receipts = self
                .sessions
                .values()
                .filter_map(|p| p.session.close_after(&messages, 1012))
                .collect::<Vec<_>>();
            self.tasks.spawn(async move {
                let closed = match tokio::time::timeout(
                    Duration::from_secs(1),
                    futures_util::future::join_all(receipts),
                )
                .await
                {
                    Ok(results) => results.iter().filter(|r| r.is_ok()).count(),
                    Err(_) => 0,
                };
                let _ = reply.send(Ok(json!({"closed":closed,"total":total})));
            });
            return;
        }
        let mut jobs = vec![];
        let result = match command {
            Operation::Drained { .. } => unreachable!("handled before dispatch"),
            Operation::Inspect | Operation::LongTables => Ok(
                json!({"users":self.sessions.values().map(Self::user).collect::<Vec<_>>(),"tables":self.tables.values().map(|e|e.view.inspection.clone()).collect::<Vec<_>>(),"activeGames":self.tables.values().filter(|e|e.view.inspection["running"]==true&&e.view.inspection["replay"]==false&&e.view.inspection["frozen"]==false).count()}),
            ),
            Operation::Maintenance { enabled } => {
                self.maintenance = enabled;
                self.broadcast(&frame("maintenance", json!({"maintenanceMode":enabled})));
                Ok(json!({"enabled":enabled}))
            }
            Operation::Shutdown {
                scheduled,
                started_at,
                imminent,
            } => {
                self.shutdown_imminent = scheduled && imminent;
                let mut metadata = json!({"shuttingDown":scheduled});
                if let Some(started_at) = started_at {
                    metadata["datetimeShutdownInit"] = json!(started_at);
                }
                self.broadcast(&frame("shutdown", metadata));
                Ok(json!({}))
            }
            Operation::Warning {
                user_id,
                message,
                error,
            } => {
                let command = if error { "error" } else { "warning" };
                let data = if error {
                    json!({"error":message})
                } else {
                    json!({"warning":message})
                };
                if let Some(id) = user_id {
                    if let Some(p) = self.sessions.get(&id) {
                        p.session.emit(&frame(command, data));
                        Ok(json!({"sent":1,"total":self.sessions.len()}))
                    } else {
                        Ok(json!({"missing":true}))
                    }
                } else {
                    self.broadcast(&frame(command, data));
                    Ok(json!({"sent":self.sessions.len(),"total":self.sessions.len()}))
                }
            }
            Operation::Kick { user_id }
            | Operation::Ban { user_id }
            | Operation::Mute { user_id } => {
                if let Some(p) = self.sessions.remove(&user_id) {
                    p.session.cancel.cancel();
                    self.broadcast(&frame("userLeft", json!({"userID":user_id})));
                }
                for e in self.tables.values() {
                    e.handle.cleanup.notify_one();
                }
                Ok(json!({}))
            }
            Operation::Unmute { user_id } | Operation::Unban { user_id } => {
                if let Some(p) = self.sessions.get(&user_id) {
                    p.session.emit(&frame(
                        "warning",
                        json!({"warning":"Your moderation settings have changed."}),
                    ));
                }
                Ok(json!({}))
            }
            Operation::Broadcast { message } => {
                self.broadcast(&frame("chat", server_chat(0, &message)));
                for e in self.tables.values() {
                    jobs.push((e.handle.clone(), TableOperation::Notice(message.clone())));
                }
                Ok(json!({}))
            }
            Operation::ClearEmptyTables | Operation::ClearPregames | Operation::TerminateGames => {
                let (pregames, empty, terminate) = match command {
                    Operation::ClearPregames => (true, false, false),
                    Operation::ClearEmptyTables => (false, true, false),
                    _ => (false, false, true),
                };
                for e in self.tables.values() {
                    jobs.push((
                        e.handle.clone(),
                        if terminate {
                            TableOperation::Terminate
                        } else {
                            TableOperation::Clear { pregames, empty }
                        },
                    ));
                }
                Ok(json!({}))
            }
            Operation::Terminate { identifier } => {
                let entry = self.tables.iter().find(|(id, e)| {
                    id.to_string() == identifier
                        || e.view.data["name"].as_str() == Some(identifier.as_str())
                });
                if let Some((_, entry)) = entry {
                    jobs.push((entry.handle.clone(), TableOperation::Terminate));
                    Ok(json!({"found":true}))
                } else {
                    Ok(json!({"found":false,"terminated":false}))
                }
            }
        };
        if jobs.is_empty() {
            let _ = reply.send(result);
            return;
        }
        self.tasks.spawn(async move {
            let outcome = async {
                let mut results = vec![];
                for (handle, operation) in jobs {
                    let (sent, received) = oneshot::channel();
                    handle
                        .sender
                        .try_send(TableCommand::Operation {
                            operation,
                            reply: sent,
                        })
                        .map_err(|_| anyhow::anyhow!("Table operation queue unavailable"))?;
                    results.push(received);
                }
                let mut values = vec![];
                for received in results {
                    values.push(received.await??);
                }
                let mut response = result?;
                response["results"] = json!(values);
                response["terminated"] = json!(values.iter().any(|v| v["terminated"] == true));
                Ok(response)
            }
            .await;
            let _ = reply.send(outcome);
        });
    }
    async fn run(mut self) {
        while let Some(command) = self.receiver.recv().await {
            match command {
                HubCommand::Register {
                    session,
                    mut welcome,
                    initial,
                    reply,
                } => {
                    if self.closing
                        || self.store.check_state().is_err()
                        || !session.active()
                        || self
                            .sessions
                            .get(&session.user)
                            .is_some_and(|p| p.session.generation > session.generation)
                    {
                        session.cancel.cancel();
                        let _ = reply.send(Err(anyhow::anyhow!("Stale or draining session")));
                        continue;
                    }
                    if let Some(old) = self.sessions.remove(&session.user) {
                        old.session.cancel.cancel();
                    }
                    for entry in self.tables.values() {
                        entry.handle.cleanup.notify_one();
                    }
                    welcome["playingAtTables"] = json!(
                        self.tables
                            .iter()
                            .filter(
                                |(_, e)| !e.view.replay && e.view.players.contains(&session.user)
                            )
                            .map(|(id, _)| id)
                            .collect::<Vec<_>>()
                    );
                    if let Some((id, shadow)) = self.tables.iter().find_map(|(id, e)| {
                        e.view
                            .reconnects
                            .get(&session.user)
                            .map(|shadow| (*id, *shadow))
                    }) {
                        welcome["disconSpectatingTable"] = json!(id);
                        welcome["disconShadowingSeat"] = json!(shadow.unwrap_or(-1));
                    }
                    self.sessions.insert(
                        session.user,
                        Presence {
                            session: session.clone(),
                            status: 0,
                            table: None,
                        },
                    );
                    let reconnect = welcome["connectionMode"] == "reconnect";
                    session.emit(&frame("welcome", welcome));
                    if !reconnect {
                        session.emit(&frame(
                            "userList",
                            json!(self.sessions.values().map(Self::user).collect::<Vec<_>>()),
                        ));
                        session.emit(&frame(
                            "tableList",
                            json!(
                                self.tables
                                    .values()
                                    .filter(|e| e.view.visible)
                                    .map(|e| Self::table_for(&e.view, session.user))
                                    .collect::<Vec<_>>()
                            ),
                        ));
                    }
                    for message in initial {
                        session.emit(&message);
                    }
                    if let Some(p) = self.sessions.get(&session.user) {
                        self.broadcast(&frame("user", Self::user(p)));
                    }
                    let _ = reply.send(Ok(()));
                }
                HubCommand::Logout(s) => {
                    s.cancel.cancel();
                    if self
                        .sessions
                        .get(&s.user)
                        .is_some_and(|p| p.session.generation == s.generation)
                    {
                        self.sessions.remove(&s.user);
                        self.broadcast(&frame("userLeft", json!({"userID":s.user})));
                    }
                    for e in self.tables.values() {
                        e.handle.cleanup.notify_one();
                    }
                }
                HubCommand::Directory { session, reply } => {
                    let result = if self.current(&session) {
                        Ok(self
                            .sessions
                            .values()
                            .filter(|p| p.session.active())
                            .map(|p| OnlineUser {
                                id: p.session.user,
                                name: p.session.name.clone(),
                                normalized_name: p.session.normalized_name.clone(),
                                generation: p.session.generation,
                            })
                            .collect())
                    } else {
                        Err(anyhow::anyhow!("Stale session"))
                    };
                    let _ = reply.send(result);
                }
                HubCommand::LobbyEffects {
                    session,
                    effects,
                    reply,
                } => {
                    let result = self.apply_effects(Some(&session), effects);
                    let _ = reply.send(result);
                }
                HubCommand::ExternalEffects { effects, reply } => {
                    let result = if effects
                        .iter()
                        .all(|e| matches!(e, Effect::Broadcast { .. }))
                    {
                        self.apply_effects(None, effects)
                    } else {
                        Err(anyhow::anyhow!("External effects must be public"))
                    };
                    let _ = reply.send(result);
                }
                HubCommand::PlayingFinished {
                    result,
                    reply,
                    claim,
                } => {
                    drop(claim);
                    let _ = reply.send(result);
                }
                HubCommand::CheckPlaying {
                    users,
                    except,
                    reply,
                } => {
                    let result = if self.closing || self.maintenance || self.shutdown_imminent {
                        Err(anyhow::anyhow!(
                            "The server is undergoing maintenance or shutting down."
                        ))
                    } else if users
                        .iter()
                        .any(|user| self.playing_elsewhere(*user, Some(except)))
                    {
                        Err(anyhow::anyhow!(
                            "An original player is already playing at another table."
                        ))
                    } else {
                        self.store.check_state()
                    };
                    let _ = reply.send(result);
                }
                HubCommand::Operations { command, reply } => self.operations(command, reply),
                HubCommand::Client {
                    session,
                    command,
                    data,
                    reply,
                } => {
                    if command == "tableCreate" || command == "replayCreate" {
                        self.create(session, command, data, reply);
                    } else {
                        let table = data["tableID"].as_u64().or_else(|| {
                            data["room"]
                                .as_str()
                                .and_then(|r| r.strip_prefix("table"))
                                .and_then(|r| r.parse().ok())
                        });
                        if let Some(table) = table {
                            self.route(
                                session,
                                table,
                                Command::Wire {
                                    name: command,
                                    data,
                                },
                                reply,
                            );
                        } else {
                            let _ = reply.send(Err(anyhow::anyhow!("Missing tableID")));
                        }
                    }
                }
                HubCommand::Create {
                    session,
                    player: _,
                    name,
                    deck,
                    reply,
                } => {
                    let data = json!({"name":name,"options":Options::default(),"maxPlayers":5,"gameJSON":deck.map(|deck|json!({"players":["Alice","Bob"],"deck":deck}))});
                    self.create(session, "tableCreate".into(), data, reply);
                }
                HubCommand::CreateConfigured {
                    session,
                    player: _,
                    name,
                    options,
                    extra,
                    reply,
                } => self.create(
                    session,
                    "tableCreate".into(),
                    json!({"name":name,"options":options,"extra":extra}),
                    reply,
                ),
                HubCommand::Allocate(reply) => {
                    let permit = self.capacity.clone().try_acquire_owned();
                    let store = self.store.clone();
                    let tasks = self.tasks.clone();
                    let closing = self.closing;
                    self.tasks.spawn(async move {
                        let result = async {
                            ensure!(!closing, "Draining");
                            let permit = permit?;
                            let id = store.allocate_table().await?;
                            Ok(Allocation::new(id, permit, store, tasks, 0))
                        }
                        .await;
                        let _ = reply.send(result);
                    });
                }
                HubCommand::Replay {
                    session,
                    snapshot,
                    mut allocation,
                    reply,
                } => {
                    let table = replay_table(*snapshot, false, session.user, &session.name);
                    let store = self.store.clone();
                    let hub = self.sender.clone();
                    self.tasks.spawn(async move {
                        match store.save(&table, 0).await {
                            Ok(revision) => {
                                allocation.revision = revision;
                                let _ = hub
                                    .send(HubCommand::Install {
                                        table: Box::new(table),
                                        revision,
                                        allocation,
                                        session,
                                        warnings: vec![],
                                        reply,
                                    })
                                    .await;
                            }
                            Err(e) => {
                                let _ = reply.send(Err(e));
                            }
                        }
                    });
                }
                HubCommand::Install {
                    table,
                    revision,
                    allocation,
                    session,
                    warnings,
                    reply,
                } => {
                    if self.closing {
                        let _ = reply.send(Err(anyhow::anyhow!(
                            "Server draining; the prepared table will recover"
                        )));
                        continue;
                    }
                    if !self.current(&session) {
                        let _ =
                            reply.send(Err(anyhow::anyhow!("Session changed during preparation")));
                        continue;
                    }
                    if self.tables.contains_key(&table.id) || allocation.id != table.id {
                        let _ = reply.send(Err(anyhow::anyhow!("Duplicate table installation")));
                        continue;
                    }
                    let actor = TableActor::new(
                        *table,
                        revision,
                        self.store.clone(),
                        self.sender.clone(),
                        allocation.into_permit(),
                    );
                    let id = actor.table.id;
                    let view = actor.view();
                    let initial = if !self.closing && self.current(&session) {
                        Some((session, warnings, reply))
                    } else {
                        let _ = reply.send(Err(anyhow::anyhow!(
                            "Session changed during preparation; table is recoverable"
                        )));
                        None
                    };
                    let handle = self.spawn(actor, initial);
                    self.tables.insert(
                        id,
                        Entry {
                            handle,
                            view,
                            published: false,
                        },
                    );
                }
                HubCommand::Spawn {
                    table,
                    revision,
                    allocation,
                    attendees,
                    chat_read,
                } => {
                    if self.closing {
                        continue;
                    }
                    let mut actor = TableActor::new(
                        *table,
                        revision,
                        self.store.clone(),
                        self.sender.clone(),
                        allocation.into_permit(),
                    );
                    actor.chat_read = chat_read;
                    let id = actor.table.id;
                    let view = actor.view();
                    let handle = self.spawn(actor, None);
                    self.tables.insert(
                        id,
                        Entry {
                            handle: handle.clone(),
                            view,
                            published: false,
                        },
                    );
                    for (session, spectator, shadow) in attendees {
                        if self.current(&session) {
                            let (reply, _) = oneshot::channel();
                            let _=handle.sender.try_send(TableCommand::Client{session,command:Command::Wire{name:if spectator{"tableSpectate".into()}else{"tableReattend".into()},data:json!({"shadowingPlayerIndex":shadow.map(|s|s as i32).unwrap_or(-1)})},reply});
                        }
                    }
                }
                HubCommand::Route {
                    session,
                    table,
                    command,
                    reply,
                } => self.route(session, table, command, reply),
                HubCommand::Sync { session, reply } => {
                    let result = if self.current(&session) && !self.closing {
                        session.emit(&frame("synced", json!({})));
                        Ok(())
                    } else {
                        Err(anyhow::anyhow!("Session unavailable"))
                    };
                    let _ = reply.send(result);
                }
                HubCommand::Effects(effects) => {
                    if self.store.check_state().is_err() {
                        continue;
                    }
                    let Some(entry) = self.tables.get_mut(&effects.table) else {
                        continue;
                    };
                    let hidden = entry.view.visible && !effects.view.visible;
                    let changed = !entry.published || entry.view != effects.view;
                    entry.view = effects.view;
                    entry.published = true;
                    if hidden {
                        self.broadcast(&frame(
                            "tableGone",
                            json!(TableRequest {
                                table_id: TableId(effects.table)
                            }),
                        ));
                    }
                    for (session, status, table) in effects.statuses {
                        if self.current(&session) {
                            if let Some(p) = self.sessions.get_mut(&session.user) {
                                p.status = status;
                                p.table = table;
                            }
                            if let Some(p) = self.sessions.get(&session.user) {
                                self.broadcast(&frame("user", Self::user(p)));
                            }
                        }
                    }
                    if changed
                        && let Some(entry) = self.tables.get(&effects.table)
                        && entry.view.visible
                    {
                        for p in self.sessions.values() {
                            p.session.emit(&frame(
                                "table",
                                Self::table_for(&entry.view, p.session.user),
                            ));
                        }
                    }
                    for (session, message) in effects.messages {
                        if self.current(&session) {
                            session.emit(&message);
                        }
                    }
                }
                HubCommand::Retire(id) => {
                    if self.tables.remove(&id).is_some_and(|e| e.view.visible) {
                        self.broadcast(&frame(
                            "tableGone",
                            json!(TableRequest {
                                table_id: TableId(id)
                            }),
                        ));
                    }
                }
                HubCommand::Quiesce(reply) => {
                    self.closing = true;
                    let _ = reply.send(self.tables.values().map(|e| e.handle.clone()).collect());
                }
                HubCommand::Stop(reply) => {
                    for p in self.sessions.values() {
                        p.session.cancel.cancel();
                    }
                    let _ = reply.send(());
                    break;
                }
            }
        }
    }
}

fn validate_table_name(name: &str) -> Result<()> {
    ensure!(
        name.chars().all(|c| c.is_alphanumeric()
            || unicode_normalization::char::is_combining_mark(c)
            || " _!#$'()+,-.:;=?@".contains(c)),
        "Invalid table name"
    );
    Ok(())
}
fn server_chat(id: u64, message: &str) -> Value {
    json!(Chat {
        who: Some("Hanab Live".into()),
        room: Some(if id == 0 {
            "lobby".into()
        } else {
            format!("table{id}")
        }),
        ..Chat::new(message, ChatSource::Server, chat_time())
    })
}
fn authored_chat(id: u64, name: &str, message: &str) -> Value {
    json!(Chat {
        who: Some(name.into()),
        room: Some(format!("table{id}")),
        ..Chat::new(
            crate::accounts::escape_html(message),
            ChatSource::User,
            chat_time()
        )
    })
}
fn chat_time() -> String {
    Utc::now().to_rfc3339_opts(chrono::SecondsFormat::Micros, true)
}

fn remove_pregame_players(table: &mut TableSnapshot, removed: &HashSet<i32>) -> Vec<Value> {
    let Phase::Pregame {
        players, countdown, ..
    } = &mut table.phase
    else {
        return vec![];
    };
    let names = players
        .iter()
        .filter(|p| removed.contains(&p.id))
        .map(|p| p.name.clone())
        .collect::<Vec<_>>();
    if names.is_empty() {
        return vec![];
    }
    players.retain(|p| !removed.contains(&p.id));
    *countdown = None;
    if players.is_empty() {
        return vec![];
    }
    if !players.iter().any(|p| p.id == table.owner) {
        table.owner = players[0].id;
    }
    for id in removed {
        table.shadows.remove(id);
    }
    names
        .into_iter()
        .filter_map(|name| {
            membership_notice(
                table,
                &format!("{} left the game.", crate::accounts::escape_html(&name)),
            )
        })
        .collect()
}

fn membership_notice(table: &mut TableSnapshot, text: &str) -> Option<Value> {
    if table.chat.len() >= 4096 {
        eprintln!(
            "Table {} membership notice omitted: chat history is full.",
            table.id
        );
        return None;
    }
    let message = server_chat(table.id, text);
    table.chat.push(TableChat {
        id: None,
        user: 0,
        message: message.clone(),
    });
    Some(message)
}
fn parse_start_minutes(argument: &str) -> Option<f64> {
    let value = format!("0{argument}");
    let decimal =
        regex::Regex::new(r"(?i)^\d(?:_?\d)*(?:\.(?:\d(?:_?\d)*)?)?(?:e[+-]?\d(?:_?\d)*)?$")
            .ok()?;
    if decimal.is_match(&value) {
        let value = value.replace('_', "").parse::<f64>().ok()?;
        return value.is_finite().then_some(value);
    }
    let hex=regex::Regex::new(r"(?i)^0x_?(?:[0-9a-f](?:_?[0-9a-f])*(?:\.(?:[0-9a-f](?:_?[0-9a-f])*)?)?|\.[0-9a-f](?:_?[0-9a-f])*)p[+-]?\d(?:_?\d)*$").ok()?;
    if !hex.is_match(&value) {
        return None;
    }
    let cleaned = value.replace('_', "").to_ascii_lowercase();
    let (mantissa, power) = cleaned[2..].split_once('p')?;
    let fraction = mantissa
        .split_once('.')
        .map_or(0, |(_, fraction)| fraction.len());
    let power = power.parse::<i64>().unwrap_or_else(|_| {
        if power.starts_with('-') {
            i64::MIN
        } else {
            i64::MAX
        }
    });
    let exponent = power.saturating_sub((fraction as i64).saturating_mul(4));
    let mut bits = Vec::new();
    for digit in mantissa.chars().filter(|c| *c != '.') {
        let value = digit.to_digit(16)?;
        for bit in (0..4).rev() {
            bits.push((value >> bit) & 1);
        }
    }
    let Some(first) = bits.iter().position(|b| *b != 0) else {
        return Some(0.0);
    };
    let bits = &bits[first..];
    let size = bits.len() as i64;
    if exponent.saturating_add(size) < -1074 {
        return Some(0.0);
    }
    if exponent.saturating_add(size) > 1024 {
        return None;
    }
    let shift = 0.max(size - 53).max(-1074 - exponent);
    let kept = (size - shift).max(0) as usize;
    let mut rounded = bits[..kept]
        .iter()
        .fold(0_u64, |v, bit| (v << 1) | u64::from(*bit));
    // Round once, including subnormal results, using guard/sticky bits.
    if bits.get(kept) == Some(&1) && (bits[kept + 1..].contains(&1) || rounded & 1 != 0) {
        rounded += 1;
    }
    let result = rounded as f64 * 2_f64.powi(i32::try_from(exponent + shift).ok()?);
    result.is_finite().then_some(result)
}
fn options_suggestion(options: &Options, name: &str, max_players: usize) -> Result<String> {
    let mut value = serde_json::to_value(options)?;
    value["tableName"] = json!(name);
    value["maxPlayers"] = json!(max_players);
    let encoded = crate::accounts::escape_html(
        &serde_json::to_string(&value)?
            .replace('\'', "\\u0027")
            .replace('"', "'"),
    );
    Ok(format!(
        "<span class=\"cp\"><button class=\"new-options\" data-new-options=\"{encoded}\">click to apply the suggestion</button></span>"
    ))
}
fn option_changes(
    table: &TableSnapshot,
    options: &Options,
    name: &str,
    max_players: usize,
) -> String {
    let current = &table.options;
    let mut changes = String::new();
    let mut add = |label: &str, value: &str| {
        changes.push_str(&format!(
            "<span class=\"cp\">{label}: <b>{}</b></span>",
            crate::accounts::escape_html(value)
        ));
    };
    if name != table.name {
        add("Table Name", name);
    }
    if options.variant_name != current.variant_name {
        add("Variant", &options.variant_name);
    }
    if options.timed {
        if !current.timed
            || options.time_base != current.time_base
            || options.time_per_turn != current.time_per_turn
        {
            add(
                "Timed",
                &format!("{} / {}", options.time_base, options.time_per_turn),
            );
        }
    } else if current.timed {
        add("Timed", "No");
    }
    if max_players != table.max_players {
        add("Max Players", &max_players.to_string());
        if max_players < table.players().len() {
            add("Warning", "Players above the new limit will be removed.");
        }
    }
    for (label, proposed, previous) in [
        ("Speedrun", options.speedrun, current.speedrun),
        ("Card Cycling", options.card_cycle, current.card_cycle),
        ("Bottom-Deck", options.deck_plays, current.deck_plays),
        ("Empty Clues", options.empty_clues, current.empty_clues),
        (
            "One Extra Card",
            options.one_extra_card,
            current.one_extra_card,
        ),
        (
            "One Less Card",
            options.one_less_card,
            current.one_less_card,
        ),
        (
            "All or Nothing",
            options.all_or_nothing,
            current.all_or_nothing,
        ),
        (
            "Detrimental Characters",
            options.detrimental_characters,
            current.detrimental_characters,
        ),
    ] {
        if proposed != previous {
            add(label, if proposed { "Yes" } else { "No" });
        }
    }
    changes
}
fn is_variant_discovery(command: &Command) -> bool {
    let Command::Wire { name, data } = command else {
        return false;
    };
    name == "chat"
        && data["msg"]
            .as_str()
            .and_then(|text| crate::accounts::normalize_chat(text).ok())
            .is_some_and(|text| {
                matches!(
                    text.split_whitespace()
                        .next()
                        .unwrap_or("")
                        .to_ascii_lowercase()
                        .as_str(),
                    "/findvariant" | "/find-variant" | "/fv" | "/randomvariant" | "/random-variant"
                )
            })
}
struct VariantDiscovery {
    requester: Arc<Session>,
    participants: Vec<(i32, String)>,
    query: std::pin::Pin<Box<dyn std::future::Future<Output = Result<Option<String>>> + Send>>,
}
fn replay_table(
    mut snapshot: Snapshot,
    shared: bool,
    owner: i32,
    owner_name: &str,
) -> TableSnapshot {
    let id = snapshot.table_id;
    let options = snapshot.game.options.clone();
    for (index, player) in snapshot.players.iter_mut().enumerate() {
        player.id = -1 - index as i32;
    }
    let name = format!(
        "{} replay for {}",
        if shared { "Shared" } else { "Solo" },
        if snapshot.game_id == 0 {
            format!(
                "{owner_name}{} JSON game",
                if owner_name.ends_with('s') { "'" } else { "'s" }
            )
        } else {
            format!("game #{}", snapshot.game_id)
        }
    );
    TableSnapshot {
        format: FORMAT.into(),
        id,
        name,
        owner,
        visible: shared,
        max_players: snapshot.players.len(),
        password_hash: None,
        extra: ExtraOptions {
            no_write_to_database: true,
            custom_seed: Some(snapshot.seed.clone()),
            ..ExtraOptions::default()
        },
        created: Utc::now(),
        options,
        phase: Phase::Replay {
            snapshot: Box::new(snapshot),
            replay: ReplayState {
                leader: owner,
                segment: 0,
                efficiency_modifier: 0,
                hypothetical: None,
                hypothetical_actions: vec![],
                show_drawn_cards: false,
            },
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
async fn prepare_table(
    store: &Store,
    session: &Session,
    command: &str,
    data: Value,
) -> Result<(TableSnapshot, i64, Vec<String>)> {
    store.check_state()?;
    ensure!(session.active(), "Stale session");
    let id = store.allocate_table().await?;
    let result = async {
        if command == "replayCreate" {
            ensure!(
                data["password"].as_str().unwrap_or("").is_empty(),
                "You cannot create a replay with a password."
            );
            let mut warnings = vec![];
            let mut custom_seed = None;
            let snapshot = if data["source"] == "json" {
                let imported = replay_helpers::parse(&data["gameJSON"])?;
                warnings = imported.warnings.clone();
                custom_seed = Some(imported.extra.custom_seed.clone());
                replay_helpers::snapshot(imported, id, session.user)
            } else {
                store
                    .historical(
                        i32::try_from(data["databaseID"].as_i64().context("Missing databaseID")?)?,
                        id,
                        session.user,
                    )
                    .await?
            };
            let mut table = replay_table(
                snapshot,
                data["visibility"] == "shared",
                session.user,
                &session.name,
            );
            if let Some(seed) = custom_seed {
                table.extra.custom_seed = seed;
            }
            let revision = store.save(&table, 0).await?;
            return Ok((table, revision, warnings));
        }
        let mut name = data["name"].as_str().unwrap_or("").trim().to_owned();
        while name.len() > 45 {
            name.pop();
        }
        if name.is_empty() {
            name = format!("{}'s table", session.name);
        }
        validate_table_name(&name)?;
        let mut options: Options =
            serde_json::from_value(data.get("options").cloned().unwrap_or(json!({})))?;
        options.starting_player = 0;
        if options.speedrun || !options.timed {
            options.timed = false;
            options.time_base = 0.0;
            options.time_per_turn = 0;
        }
        if options.one_extra_card && options.one_less_card {
            options.one_extra_card = false;
            options.one_less_card = false;
        }
        ensure!(
            !options.timed
                || (options.time_base > 0.0
                    && options.time_base <= 604800.0
                    && (1..=86400).contains(&options.time_per_turn)),
            "Invalid timed options"
        );
        let mut extra: ExtraOptions =
            serde_json::from_value(data.get("extra").cloned().unwrap_or(json!({})))?;
        if name.starts_with('!') {
            ensure!(
                data.get("gameJSON").is_none_or(Value::is_null),
                "Special prefixes cannot be combined with JSON"
            );
            let parts = name.split_whitespace().collect::<Vec<_>>();
            if parts.first() == Some(&"!seed") {
                ensure!(
                    parts.len() == 2
                        && parts[1]
                            .bytes()
                            .all(|b| b.is_ascii_alphanumeric() || b == b'-'),
                    "Expected !seed [seed name]"
                );
                extra.set_seed_suffix = parts[1].into();
            } else if parts.first() == Some(&"!replay") {
                ensure!(
                    (2..=3).contains(&parts.len()),
                    "Expected !replay [game ID] [turn]"
                );
                let historical = store
                    .historical(parts[1].parse()?, id, session.user)
                    .await?;
                let turn = if parts.len() == 3 {
                    parts[2]
                        .parse::<usize>()?
                        .checked_sub(1)
                        .context("Turn must be positive")?
                } else {
                    0
                };
                ensure!(
                    turn < historical.game.turn as usize,
                    "Replay turn exceeds game"
                );
                options = historical.game.options.clone();
                extra.custom_seed = Some(historical.seed);
                extra.custom_deck = Some(historical.game.identities());
                extra.custom_deck_is_shuffled = true;
                extra.custom_characters = Some(
                    historical
                        .game
                        .players
                        .iter()
                        .map(|p| hanabi_engine::AssignedCharacter {
                            name: if p.character.is_empty() {
                                "n/a".into()
                            } else {
                                p.character.clone()
                            },
                            metadata: if matches!(
                                p.character.as_str(),
                                "Fuming" | "Dumbfounded" | "Inept" | "Awkward"
                            ) {
                                p.character_metadata
                            } else {
                                -1
                            },
                        })
                        .collect(),
                );
                extra.custom_actions = historical
                    .game
                    .actions
                    .iter()
                    .map(|a| Action {
                        kind: a.action_type as u8,
                        target: a.target,
                        value: a.value,
                    })
                    .collect();
                extra.custom_num_players = Some(options.num_players);
                extra.set_replay = true;
                extra.set_replay_turn = turn;
            } else {
                bail!("Unknown special game prefix");
            }
        } else if let Some(input) = data.get("gameJSON").filter(|v| !v.is_null()) {
            let imported = replay_helpers::parse(input)?;
            options = imported.game.options.clone();
            extra = imported.extra;
        }
        let variant = hanabi_engine::get_variant(&options.variant_name)?;
        options.variant_id = Some(variant.id);
        let player = store
            .player_for_variant(session.user, session.name.clone(), variant.id)
            .await?;
        let max_players = data["maxPlayers"]
            .as_u64()
            .map(|n| n as usize)
            .filter(|n| (2..=6).contains(n))
            .unwrap_or(5)
            .max(extra.custom_num_players.unwrap_or(2));
        let password = data["password"].as_str().unwrap_or("").to_owned();
        let password_hash = if password.is_empty() {
            None
        } else {
            ensure!(password.len() <= 1024, "Password too long");
            Some(crate::accounts::hash_password(password).await?)
        };
        ensure!(session.active(), "Creator disconnected during preparation");
        let table = TableSnapshot {
            format: FORMAT.into(),
            id,
            name,
            owner: session.user,
            visible: !data["hidePregame"].as_bool().unwrap_or(false),
            options,
            max_players,
            password_hash,
            extra,
            created: Utc::now(),
            phase: Phase::Pregame {
                players: vec![player],
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
        };
        let revision = store.save(&table, 0).await?;
        Ok((table, revision, vec![]))
    }
    .await;
    if result.is_err() {
        let _ = store.remove(id, 0).await;
    }
    result
}

struct Attendance {
    session: Arc<Session>,
    loaded: bool,
    spectator: bool,
    shadow: Option<usize>,
    typing_until: Option<Instant>,
}
struct TableActor {
    table: TableSnapshot,
    revision: i64,
    frozen: bool,
    retired: bool,
    attendees: HashMap<i32, Attendance>,
    chat_read: HashMap<i32, usize>,
    pregame_absent_until: HashMap<i32, Instant>,
    cleanup: Arc<Notify>,
    store: Store,
    hub: mpsc::Sender<HubCommand>,
    anchor: Instant,
    _permit: OwnedSemaphorePermit,
    playing_claims: Arc<Mutex<HashSet<i32>>>,
}
impl TableActor {
    fn new(
        table: TableSnapshot,
        revision: i64,
        store: Store,
        hub: mpsc::Sender<HubCommand>,
        permit: OwnedSemaphorePermit,
    ) -> Self {
        Self {
            table,
            revision,
            frozen: false,
            retired: false,
            attendees: HashMap::new(),
            chat_read: HashMap::new(),
            pregame_absent_until: HashMap::new(),
            cleanup: Arc::new(Notify::new()),
            store,
            hub,
            anchor: Instant::now(),
            _permit: permit,
            playing_claims: Arc::new(Mutex::new(HashSet::new())),
        }
    }
    fn view(&self) -> TableView {
        let replay = matches!(self.table.phase, Phase::Replay { .. });
        let running = !matches!(self.table.phase, Phase::Pregame { .. });
        let progress = if let Some(s) = self.table.game() {
            if let Phase::Replay { replay, .. } = &self.table.phase {
                (replay.segment * 100 / s.game.turn.max(1)).clamp(0, 100)
            } else {
                s.game.score * 100
                    / hanabi_engine::get_variant(&self.table.options.variant_name)
                        .expect("variant")
                        .max_score
            }
        } else {
            0
        };
        let spectators = self.spectators();
        TableView {
            players: self.table.players().iter().map(|p| p.id).collect(),
            replay,
            visible: self.table.visible,
            reconnects: self
                .table
                .shadows
                .iter()
                .filter(|(id, _)| replay || self.table.players().iter().all(|p| p.id != **id))
                .map(|(id, shadow)| (*id, *shadow))
                .collect(),
            inspection: json!({"id":self.table.id,"name":self.table.name,"created":self.table.created,"running":running,"replay":replay,"frozen":self.frozen}),
            data: json!({"id":self.table.id,"joined":false,"maxPlayers":self.table.max_players,"name":self.table.name,"numPlayers":self.table.players().len(),"options":self.table.options,"ownerID":self.table.owner,"passwordProtected":self.table.password_hash.is_some(),"players":self.table.players().iter().map(|p|&p.name).collect::<Vec<_>>(),"progress":progress,"running":running,"sharedReplay":replay&&self.table.visible,"spectators":spectators,"timeBase":self.table.options.time_base,"timePerTurn":self.table.options.time_per_turn,"timed":self.table.options.timed,"variant":self.table.options.variant_name}),
        }
    }
    fn spectators(&self) -> Vec<Value> {
        self.attendees.values().filter(|a|a.spectator&&a.session.active()).map(|a|json!({"name":a.session.name,"shadowingPlayerIndex":a.shadow.map(|v|v as i32).unwrap_or(-1),"shadowingPlayerUsername":a.shadow.and_then(|i|self.table.players().get(i)).map(|p|p.name.as_str()).unwrap_or("")})).collect()
    }
    fn spectator_messages(&self, e: &mut Effects) {
        self.add_all(
            e,
            "spectators",
            json!({"tableID":self.table.id,"spectators":self.spectators()}),
        );
    }
    fn effects(&self) -> Effects {
        Effects {
            table: self.table.id,
            view: self.view(),
            statuses: vec![],
            messages: vec![],
        }
    }
    async fn publish(&self, effects: Effects) -> Result<()> {
        self.store.check_state()?;
        self.hub
            .send(HubCommand::Effects(effects))
            .await
            .context("Coordinator stopped")
    }
    fn attending(&self, s: &Session) -> bool {
        s.active()
            && self
                .attendees
                .get(&s.user)
                .is_some_and(|a| a.session.generation == s.generation)
    }
    fn seat(&self, s: &Session) -> Result<usize> {
        self.table
            .players()
            .iter()
            .position(|p| p.id == s.user)
            .context("You are not playing at this table")
    }
    fn audience(&self) -> impl Iterator<Item = &Attendance> {
        self.attendees.values().filter(|a| a.session.active())
    }
    fn add_all(&self, e: &mut Effects, command: &str, data: Value) {
        let message = frame(command, data);
        for a in self.audience() {
            e.messages.push((a.session.clone(), message.clone()));
        }
    }
    fn typing_messages(&self, e: &mut Effects, author: i32, name: &str, typing: bool) {
        let message = frame(
            "chatTyping",
            ChatTyping {
                table_id: TableId(self.table.id),
                name: name.into(),
                typing,
            },
        );
        for a in self.audience().filter(|a| a.session.user != author) {
            e.messages.push((a.session.clone(), message.clone()));
        }
    }
    fn pregame_messages(&self, e: &mut Effects) {
        for a in self.audience() {
            e.messages.push((a.session.clone(),frame("game",json!({"tableID":self.table.id,"name":self.table.name,"owner":self.table.owner,
        "players":self.table.players().iter().enumerate().map(|(i,p)|json!({"index":i,"name":p.name,"you":p.id==a.session.user,"present":self.attendees.get(&p.id).is_some_and(|a|a.session.active()&&!a.spectator),"stats":p.stats})).collect::<Vec<_>>(),"options":self.table.options,"passwordProtected":self.table.password_hash.is_some(),"maxPlayers":self.table.max_players}))));
        }
    }
    fn chat_history(&self, e: &mut Effects, session: &Arc<Session>) {
        let read = self.chat_read.get(&session.user).copied().unwrap_or(0);
        e.messages.push((
            session.clone(),
            frame(
                "chatList",
                json!({
                    "list":self.table.chat.iter().map(|chat| &chat.message).collect::<Vec<_>>(),
                    "unread":self.table.chat.len().saturating_sub(read)
                }),
            ),
        ));
    }
    fn candidate(&self) -> TableSnapshot {
        let mut next = self.table.clone();
        let live = matches!(next.phase, Phase::Live { .. });
        let delta = self.anchor.elapsed().as_millis().min(9_007_199_254_740_991) as i64;
        if let Some(s) = next.game_mut() {
            s.idle_remaining = (s.idle_remaining - delta).max(0);
            if live && s.game.end_condition == EndCondition::InProgress {
                s.duration = s.duration.saturating_add(delta);
                if s.timer_started && !s.game.paused {
                    let active = s.game.active_player_index;
                    s.clocks[active] -= delta;
                    s.turn_elapsed += delta;
                }
            }
        }
        next
    }
    async fn persist(&mut self, mut next: TableSnapshot) -> Result<()> {
        self.store.check_state()?;
        ensure!(!self.frozen, "Table is frozen until recovery");
        if next.visible
            && next
                .chat
                .iter()
                .skip(self.table.chat.len())
                .any(|chat| chat.user > 0)
            && let Phase::Replay { snapshot, .. } = &mut next.phase
        {
            snapshot.idle_remaining = IDLE_TIMEOUT_MS;
        }
        let old_ids = self
            .table
            .players()
            .iter()
            .map(|p| p.id)
            .collect::<Vec<_>>();
        let new_ids = next.players().iter().map(|p| p.id).collect::<Vec<_>>();
        if old_ids != new_ids {
            for shadow in next.shadows.values_mut() {
                *shadow = shadow
                    .and_then(|seat| usize::try_from(seat).ok())
                    .and_then(|seat| old_ids.get(seat))
                    .and_then(|id| new_ids.iter().position(|new| new == id))
                    .map(|seat| seat as i32);
            }
        }
        if let Some(s) = next.game_mut()
            && s.game.end_condition != EndCondition::InProgress
            && s.finished.is_none()
        {
            s.finished = Some(Utc::now());
        }
        next.validate()?;
        self.store.prepare_chat(&mut next).await?;
        ensure!(
            serde_json::to_vec(&next)?.len() <= 4 * 1024 * 1024,
            "Checkpoint exceeds the durable state limit"
        );
        let result = async {
            let mut revision = self.store.save(&next, self.revision).await?;
            if let Some(edit) = next.pending_tag.take() {
                let tags = self.store.apply_tag(&edit).await?;
                next.game_mut().context("Missing tagged replay")?.tags = tags;
                revision = self.store.save(&next, revision).await?;
            }
            if next.chat_archived < next.chat.len() {
                self.store
                    .archive_chat(&next.chat[next.chat_archived..])
                    .await?;
                next.chat_archived = next.chat.len();
                revision = self.store.save(&next, revision).await?;
            }
            if let Phase::Live { snapshot } = &next.phase
                && snapshot.game.end_condition != EndCondition::InProgress
            {
                if !next.extra.no_write_to_database {
                    self.store.complete(snapshot, revision).await?;
                    self.store.refresh_background((**snapshot).clone());
                }
                next.convert_to_replay()?;
                for a in self.audience() {
                    next.shadows.insert(a.session.user, None);
                }
                revision = self.store.save(&next, revision).await?;
            }
            Ok::<i64, anyhow::Error>(revision)
        }
        .await;
        match result {
            Ok(revision) => {
                self.revision = revision;
                let became_replay = matches!(self.table.phase, Phase::Live { .. })
                    && matches!(next.phase, Phase::Replay { .. });
                self.table = next;
                for a in self.attendees.values_mut() {
                    if became_replay {
                        a.spectator = true;
                        a.shadow = None;
                    }
                    if let Some(shadow) = self.table.shadows.get(&a.session.user) {
                        a.shadow = shadow.and_then(|s| usize::try_from(s).ok());
                    }
                }
                self.anchor = Instant::now();
                Ok(())
            }
            Err(error) => {
                self.frozen = true;
                let _ = self.hub.try_send(HubCommand::Effects(self.effects()));
                eprintln!("Table {} storage uncertain: {error}", self.table.id);
                bail!("Storage result is uncertain; table frozen until recovery")
            }
        }
    }
    async fn initialize(&mut self, s: Arc<Session>, warnings: Vec<String>) -> Result<()> {
        self.pregame_absent_until.remove(&s.user);
        let replay = matches!(self.table.phase, Phase::Replay { .. });
        if replay {
            let mut next = self.candidate();
            next.game_mut().context("Missing replay")?.idle_remaining = IDLE_TIMEOUT_MS;
            next.shadows.insert(s.user, None);
            self.persist(next).await?;
        }
        self.attendees.insert(
            s.user,
            Attendance {
                session: s.clone(),
                loaded: false,
                spectator: replay,
                shadow: None,
                typing_until: None,
            },
        );
        let mut e = self.effects();
        if matches!(self.table.phase, Phase::Pregame { .. }) {
            e.statuses.push((s.clone(), 1, Some(self.table.id)));
            self.pregame_messages(&mut e);
            e.messages.push((
                s.clone(),
                frame(
                    "joined",
                    json!(TableRequest {
                        table_id: TableId(self.table.id)
                    }),
                ),
            ));
            self.chat_history(&mut e, &s);
        } else {
            e.statuses.push((
                s.clone(),
                if self.table.visible { 5 } else { 4 },
                Some(self.table.id),
            ));
            e.messages.push((
                s.clone(),
                frame(
                    "tableStart",
                    json!(TableStarted {
                        table_id: TableId(self.table.id),
                        replay: true
                    }),
                ),
            ));
        }
        for warning in warnings {
            e.messages
                .push((s.clone(), frame("warning", json!({"warning":warning}))));
        }
        self.publish(e).await
    }
    async fn run(
        mut self,
        mut receiver: mpsc::Receiver<TableCommand>,
        initial: Option<(Arc<Session>, Vec<String>, Reply)>,
    ) {
        let mut pregame_refresh =
            if initial.is_none() && matches!(self.table.phase, Phase::Pregame { .. }) {
                let pool = self.store.lobby_reads.clone();
                let users = self
                    .table
                    .players()
                    .iter()
                    .map(|player| player.id)
                    .collect::<Vec<_>>();
                Some(Box::pin(async move {
                    let counts = crate::database::normal_game_counts(&pool, &users, false).await?;
                    Ok::<_, anyhow::Error>((users, counts))
                }))
            } else {
                None
            };
        if let Some((session, warnings, reply)) = initial {
            let result = self.initialize(session, warnings).await;
            let _ = reply.send(result);
        }
        let mut tick = tokio::time::interval(Duration::from_millis(250));
        tick.set_missed_tick_behavior(tokio::time::MissedTickBehavior::Skip);
        let mut discovery: Option<(VariantDiscovery, Reply)> = None;
        loop {
            if self.retired {
                break;
            }
            let discovering = discovery.is_some();
            tokio::select! {
                result=async{pregame_refresh.as_mut().expect("enabled statistics refresh").await},if pregame_refresh.is_some()=>{
                    pregame_refresh = None;
                    let applied = async {
                        let (users, counts) = result?;
                        let mut next = self.candidate();
                        let Phase::Pregame { players, .. } = &mut next.phase else { return Ok::<_, anyhow::Error>(()); };
                        let mut changed = false;
                        for player in players.iter_mut().filter(|player| users.contains(&player.id)) {
                            let count = counts.get(&player.id).copied().unwrap_or(0);
                            let stats = player.stats.as_object_mut().context("Invalid cached pregame statistics")?;
                            if stats.get("numGames").and_then(Value::as_i64) != Some(count) {
                                stats.insert("numGames".into(), json!(count));
                                changed = true;
                            }
                        }
                        if changed {
                            self.persist(next).await?;
                            let mut effects = self.effects();
                            self.pregame_messages(&mut effects);
                            self.publish(effects).await?;
                        }
                        Ok(())
                    }.await;
                    if let Err(error)=applied { eprintln!("Deferred pregame statistics failed for table {}: {error:#}", self.table.id); }
                },
                selected=async{discovery.as_mut().expect("enabled discovery").0.query.as_mut().await},if discovering=>{
                    let (query,reply)=discovery.take().expect("completed discovery");
                    let result=self.finish_discovery(query,selected).await;
                    let _=reply.send(result);
                },
                command=receiver.recv()=>{
                    let Some(command)=command else{break;};
                    match command{
                        TableCommand::Drain(reply)=>{
                            let result=async{
                                self.store.check_state()?;ensure!(!self.frozen,"Cannot drain frozen table");
                                let mut next=self.candidate();
                                if let Some(s)=next.game_mut()&&s.game.end_condition==EndCondition::InProgress&&s.game.options.timed&&!s.maintenance_applied{
                                    for clock in &mut s.clocks{*clock+=20_000;}s.maintenance_applied=true;
                                }
                                self.persist(next).await
                            }.await;
                            let _=reply.send(result);break;
                        },
                        TableCommand::Client{session,command,reply}=>{
                            if is_variant_discovery(&command){
                                if discovering{
                                    let _=reply.send(Err(anyhow::anyhow!("A variant search is already pending at this table.")));
                                }else{
                                    match self.prepare_discovery(session){
                                        Ok(query)=>discovery=Some((query,reply)),
                                        Err(error)=>{let _=reply.send(Err(error));}
                                    }
                                }
                                continue;
                            }
                            let result=if !session.active()||self.store.check_state().is_err(){Err(anyhow::anyhow!("Stale session or unavailable authority"))}else{self.command(session,command).await};
                            let _=reply.send(result);
                        },
                        TableCommand::Operation{operation,reply}=>{let result=self.operation(operation).await;let _=reply.send(result);},
                    }
                },
                _=self.cleanup.notified()=>{if let Err(e)=self.cleanup(Instant::now()).await{eprintln!("Table cleanup: {e}");}},
                _=tick.tick()=>{if !self.frozen&&self.store.check_state().is_ok()&&let Err(e)=self.tick().await{eprintln!("Table timer: {e}");}},
            }
        }
        if let Some((_, reply)) = discovery.take() {
            let _ = reply.send(Err(anyhow::anyhow!(
                "Table closed during variant discovery"
            )));
        }
        receiver.close();
        while let Some(command) = receiver.recv().await {
            match command {
                TableCommand::Drain(reply) => {
                    let _ = reply.send(if self.retired {
                        Ok(())
                    } else {
                        self.store.check_state()
                    });
                }
                TableCommand::Client { reply, .. } => {
                    let _ = reply.send(Err(anyhow::anyhow!("Table closed")));
                }
                TableCommand::Operation { reply, .. } => {
                    let _ = reply.send(Err(anyhow::anyhow!("Table closed")));
                }
            }
        }
    }
    fn prepare_discovery(&self, requester: Arc<Session>) -> Result<VariantDiscovery> {
        self.store.check_state()?;
        ensure!(
            !self.frozen && self.attending(&requester),
            "You are not at an available table."
        );
        let participants = if matches!(self.table.phase, Phase::Replay { .. }) {
            self.audience()
                .map(|a| (a.session.user, a.session.name.clone()))
                .collect::<Vec<_>>()
        } else {
            self.table
                .players()
                .iter()
                .map(|p| (p.id, p.name.clone()))
                .collect()
        };
        ensure!(
            (2..=6).contains(&participants.len()),
            "This command requires two to six participants"
        );
        let count = participants.len();
        let ids = participants.iter().map(|(id, _)| *id).collect::<Vec<_>>();
        let store = self.store.clone();
        let query = Box::pin(async move {
            // Only the validated numeric player count is interpolated; user IDs remain bound.
            #[derive(sqlx::FromRow)]
            struct VariantScore {
                variant_id: i16,
                score: i16,
            }
            let rows = sqlx::query_as::<_, VariantScore>(sqlx::AssertSqlSafe(format!(
                "SELECT variant_id,best_score{count} AS score FROM user_stats WHERE user_id=ANY($1)"
            )))
            .bind(ids)
            .fetch_all(&store.primary)
            .await?;
            let mut completed = HashSet::new();
            for row in rows {
                let id = u32::try_from(row.variant_id)?;
                if i32::from(row.score) == hanabi_engine::get_variant_by_id(id)?.max_score {
                    completed.insert(id);
                }
            }
            let missing = hanabi_engine::variants()
                .iter()
                .filter(|v| !completed.contains(&v.id))
                .collect::<Vec<_>>();
            Ok(if missing.is_empty() {
                None
            } else {
                Some(missing[rand::random_range(0..missing.len())].name.clone())
            })
        });
        Ok(VariantDiscovery {
            requester,
            participants,
            query,
        })
    }
    async fn finish_discovery(
        &mut self,
        query: VariantDiscovery,
        selected: Result<Option<String>>,
    ) -> Result<()> {
        self.store.check_state()?;
        ensure!(
            !self.frozen && self.attending(&query.requester),
            "Variant requester is no longer at this table."
        );
        let selected = selected?;
        let text=selected.as_ref().map_or_else(||"No missing variants for this team.".to_owned(),|name|
            format!("Here is a random variant that everyone needs the {}-player max score in: {name}",query.participants.len()));
        let message = server_chat(self.table.id, &text);
        let mut next = self.candidate();
        next.chat.push(TableChat {
            id: None,
            user: 0,
            message: message.clone(),
        });
        self.persist(next).await?;
        let mut effects = self.effects();
        self.add_all(&mut effects, "chat", message);
        if let Some(variant) = selected
            && matches!(self.table.phase, Phase::Pregame { .. })
            && self.table.players().len() == query.participants.len()
            && self
                .table
                .players()
                .iter()
                .all(|player| query.participants.iter().any(|(id, _)| *id == player.id))
            && let Some(owner) = self
                .attendees
                .get(&self.table.owner)
                .filter(|a| self.attending(&a.session))
        {
            let mut options = self.table.options.clone();
            options.variant_name = variant;
            let mut proposal = server_chat(
                self.table.id,
                &options_suggestion(&options, &self.table.name, self.table.max_players)?,
            );
            proposal["recipient"] = json!(owner.session.name);
            effects
                .messages
                .push((owner.session.clone(), frame("chat", proposal)));
        }
        self.publish(effects).await
    }
    async fn cleanup(&mut self, now: Instant) -> Result<()> {
        self.store.check_state()?;
        ensure!(!self.frozen, "Frozen table cannot be cleaned up");
        let before = self.attendees.len();
        let expired = self
            .attendees
            .values()
            .filter(|a| !a.session.active() && a.typing_until.is_some())
            .map(|a| (a.session.user, a.session.name.clone()))
            .collect::<Vec<_>>();
        self.attendees.retain(|_, a| a.session.active());
        let successor = self.audience().next().map(|a| a.session.user);
        if before != self.attendees.len()
            && matches!(self.table.phase, Phase::Replay { .. })
            && !self.attendees.contains_key(&self.table.owner)
            && let Some(successor) = successor
        {
            let mut next = self.candidate();
            next.owner = successor;
            if let Phase::Replay { replay, .. } = &mut next.phase {
                replay.leader = successor;
            }
            self.persist(next).await?;
        }
        if before != self.attendees.len() {
            let mut e = self.effects();
            for (id, name) in expired {
                self.typing_messages(&mut e, id, &name, false);
            }
            self.add_all(&mut e, "connected", self.connected());
            self.spectator_messages(&mut e);
            self.publish(e).await?;
        }
        self.cleanup_pregame(now).await
    }
    async fn cleanup_pregame(&mut self, now: Instant) -> Result<()> {
        let Phase::Pregame { players, .. } = &self.table.phase else {
            self.pregame_absent_until.clear();
            return Ok(());
        };
        let absent = players
            .iter()
            .filter(|p| {
                !self
                    .attendees
                    .get(&p.id)
                    .is_some_and(|a| !a.spectator && a.session.active())
            })
            .map(|p| p.id)
            .collect::<HashSet<_>>();
        self.pregame_absent_until
            .retain(|id, _| absent.contains(id));
        for id in absent {
            // Recovered pregames also get a fresh grace period for reconnecting clients.
            self.pregame_absent_until
                .entry(id)
                .or_insert(now + PREGAME_RECONNECT_GRACE);
        }
        let removed = self
            .pregame_absent_until
            .iter()
            .filter(|(_, deadline)| now >= **deadline)
            .map(|(id, _)| *id)
            .collect::<HashSet<_>>();
        if removed.is_empty() {
            return Ok(());
        }
        let mut next = self.candidate();
        let notices = remove_pregame_players(&mut next, &removed);
        if next.players().is_empty() {
            return self.retire().await;
        }
        self.persist(next).await?;
        self.pregame_absent_until
            .retain(|id, _| !removed.contains(id));
        let mut effects = self.effects();
        self.pregame_messages(&mut effects);
        self.spectator_messages(&mut effects);
        for message in notices {
            self.add_all(&mut effects, "chat", message);
        }
        self.publish(effects).await
    }
    fn connected(&self) -> Value {
        let replay = matches!(self.table.phase, Phase::Replay { .. });
        json!({"tableID":self.table.id,"list":self.table.players().iter().map(|p|replay || self.attendees.get(&p.id).is_some_and(|a|a.loaded&&!a.spectator&&a.session.active())).collect::<Vec<_>>()})
    }
    fn clock(&self) -> Value {
        let next = self.candidate();
        let s = next.game().expect("game clock");
        let live = matches!(next.phase, Phase::Live { .. })
            && s.game.end_condition == EndCondition::InProgress;
        json!({"tableID":self.table.id,"times":s.clocks,"activePlayerIndex":if live{s.game.active_player_index as i32}else{-1},"timeTaken":if !live || s.game.paused{0}else{s.turn_elapsed}})
    }
    async fn command(&mut self, session: Arc<Session>, command: Command) -> Result<()> {
        ensure!(!self.frozen, "Table is frozen until recovery");
        if matches!(self.table.phase, Phase::Live { .. }) {
            let candidate = self.candidate();
            if candidate.game().is_some_and(|s| {
                s.idle_remaining == 0
                    || (s.game.options.timed
                        && s.timer_started
                        && !s.game.paused
                        && s.clocks[s.game.active_player_index] <= 0)
            }) {
                self.tick().await?;
            }
        }
        let (name, data) = match command {
            Command::Join(player) => {
                ensure!(player.id == session.user, "Player mismatch");
                ("tableJoin".into(), json!({}))
            }
            Command::Start(id) => ("tableStart".into(), json!({"requestID":id})),
            Command::Loaded(id) => ("loaded".into(), json!({"requestID":id})),
            Command::Action(a, id) => (
                "action".into(),
                json!({"type":a.kind,"target":a.target,"value":a.value,"requestID":id}),
            ),
            Command::Info(p) => (format!("getGameInfo{p}"), json!({})),
            Command::Reattend => ("tableReattend".into(), json!({})),
            Command::Unattend => ("tableUnattend".into(), json!({})),
            Command::Wire { name, data } => (name, data),
        };
        let request = data["requestID"].as_str();
        if self.table.duplicate(session.user, request) {
            return Ok(());
        }
        match name.as_str() {
            "tableJoin" => self.join(session, &data).await,
            "tableReattend" | "tableSpectate" => {
                self.reattend(session, &data, name == "tableSpectate").await
            }
            "tableUnattend" | "tableLeave" => self.leave(session, name == "tableLeave").await,
            "getGameInfo1" | "getGameInfo2" => {
                self.info(session, if name == "getGameInfo1" { 1 } else { 2 })
                    .await
            }
            "tableStart" => {
                if data["intendedVariant"]
                    .as_str()
                    .is_some_and(|v| !v.is_empty() && v != self.table.options.variant_name)
                    || data["intendedPlayers"].as_array().is_some_and(|names| {
                        names.len() != self.table.players().len()
                            || self
                                .table
                                .players()
                                .iter()
                                .any(|p| !names.iter().any(|n| n.as_str() == Some(p.name.as_str())))
                    })
                {
                    return Ok(());
                }
                self.start(session, request).await
            }
            "loaded" => {
                ensure!(self.attending(&session), "Reattend before loading");
                let mut next = self.candidate();
                if let Phase::Live { snapshot: s } = &mut next.phase
                    && s.game.end_condition == EndCondition::InProgress
                    && s.players[s.game.active_player_index].id == session.user
                {
                    s.timer_started = true;
                    s.game.started_timer = true;
                }
                next.remember(session.user, request)?;
                self.persist(next).await?;
                if let Some(a) = self.attendees.get_mut(&session.user) {
                    a.loaded = true;
                }
                let mut e = self.effects();
                self.add_all(&mut e, "connected", self.connected());
                if matches!(self.table.phase, Phase::Live { .. }) {
                    self.add_all(&mut e, "clock", self.clock());
                }
                self.publish(e).await
            }
            "action" => self.action(session, &data).await,
            "tableTerminate" if matches!(self.table.phase, Phase::Pregame { .. }) => {
                ensure!(
                    self.attending(&session) && session.user == self.table.owner,
                    "Only owner can terminate"
                );
                self.retire().await
            }
            "tableTerminate" | "tableVoteForTermination" => {
                self.terminate(session, request, name == "tableVoteForTermination")
                    .await
            }
            "pause" => self.pause(session, &data).await,
            "note" => self.note(session, &data).await,
            "tag" | "tagDelete" | "tagsDeleteAll" => self.tag(session, &data, &name).await,
            "chat" => self.chat(session, &data).await,
            "chatRead" | "chatTyping" => self.chat_presence(session, name == "chatTyping").await,
            "tableSetLeader" => self.leader(session, &data).await,
            "tableSuggest" => self.suggest(session, &data).await,
            "tableUpdate" | "tableSetVariant" => {
                self.update(session, &data, name == "tableSetVariant").await
            }
            "tableRestart" => self.restart(session, &data).await,
            "replayAction" => self.replay_action(session, &data).await,
            "tableAbandon" => self.leave(session, true).await,
            _ => bail!("Unsupported table command: {name}"),
        }
    }
    async fn update(
        &mut self,
        session: Arc<Session>,
        data: &Value,
        variant_only: bool,
    ) -> Result<()> {
        ensure!(self.attending(&session), "You must attend this table");
        self.seat(&session)?;
        ensure!(
            matches!(self.table.phase, Phase::Pregame { .. }),
            "Game already started"
        );
        ensure!(
            !variant_only || session.user == self.table.owner,
            "Only owner can change variant"
        );
        let mut options = if variant_only {
            self.table.options.clone()
        } else {
            serde_json::from_value(data.get("options").cloned().unwrap_or(json!({})))?
        };
        if variant_only {
            options.variant_name = data["options"]["variantName"]
                .as_str()
                .context("Missing variant")?
                .into();
        }
        options.starting_player = 0;
        if options.speedrun || !options.timed {
            options.timed = false;
            options.time_base = 0.0;
            options.time_per_turn = 0;
        }
        ensure!(
            !options.timed
                || (options.time_base > 0.0
                    && options.time_base <= 604800.0
                    && (1..=86400).contains(&options.time_per_turn)),
            "Invalid timed options"
        );
        if options.one_extra_card && options.one_less_card {
            options.one_extra_card = false;
            options.one_less_card = false;
        }
        let mut name = if variant_only {
            self.table.name.clone()
        } else {
            crate::accounts::truncate_to_max_bytes(data["name"].as_str().unwrap_or(""), 45)
                .trim()
                .to_owned()
        };
        if name.is_empty() {
            name = self.table.name.clone();
        }
        validate_table_name(&name)?;
        let mut max_players = if variant_only {
            self.table.max_players
        } else {
            data["maxPlayers"]
                .as_u64()
                .map(|n| n as usize)
                .filter(|n| (2..=6).contains(n))
                .unwrap_or(5)
        };
        let mut extra = if variant_only {
            self.table.extra.clone()
        } else {
            ExtraOptions::default()
        };
        if !variant_only && session.user == self.table.owner {
            if name.starts_with('!') {
                ensure!(
                    data.get("gameJSON").is_none_or(Value::is_null),
                    "Special prefixes cannot be combined with JSON"
                );
                let parts = name.split_whitespace().collect::<Vec<_>>();
                match parts.first().copied() {
                    Some("!seed") => {
                        ensure!(
                            parts.len() == 2
                                && parts[1]
                                    .bytes()
                                    .all(|b| b.is_ascii_alphanumeric() || b == b'-'),
                            "Expected !seed [seed name]"
                        );
                        extra.set_seed_suffix = parts[1].into();
                    }
                    Some("!replay") => {
                        ensure!(
                            (2..=3).contains(&parts.len()),
                            "Expected !replay [game ID] [turn]"
                        );
                        let historical = self
                            .store
                            .historical(parts[1].parse()?, self.table.id, session.user)
                            .await?;
                        let turn = if parts.len() == 3 {
                            parts[2]
                                .parse::<usize>()?
                                .checked_sub(1)
                                .context("Turn must be positive")?
                        } else {
                            0
                        };
                        ensure!(
                            turn < historical.game.turn as usize,
                            "Replay turn exceeds game"
                        );
                        options = historical.game.options.clone();
                        extra.custom_seed = Some(historical.seed);
                        extra.custom_deck = Some(historical.game.identities());
                        extra.custom_deck_is_shuffled = true;
                        extra.custom_num_players = Some(options.num_players);
                        extra.set_replay = true;
                        extra.set_replay_turn = turn;
                        extra.custom_characters = Some(
                            historical
                                .game
                                .players
                                .iter()
                                .map(|p| hanabi_engine::AssignedCharacter {
                                    name: if p.character.is_empty() {
                                        "n/a".into()
                                    } else {
                                        p.character.clone()
                                    },
                                    metadata: if matches!(
                                        p.character.as_str(),
                                        "Fuming" | "Dumbfounded" | "Inept" | "Awkward"
                                    ) {
                                        p.character_metadata
                                    } else {
                                        -1
                                    },
                                })
                                .collect(),
                        );
                        extra.custom_actions = historical
                            .game
                            .actions
                            .iter()
                            .map(|a| Action {
                                kind: a.action_type as u8,
                                target: a.target,
                                value: a.value,
                            })
                            .collect();
                    }
                    _ => bail!("Unknown special game prefix"),
                }
            } else if let Some(input) = data.get("gameJSON").filter(|v| !v.is_null()) {
                let imported = replay_helpers::parse(input)?;
                options = imported.game.options.clone();
                extra = imported.extra;
            }
        }
        let variant = hanabi_engine::get_variant(&options.variant_name)?;
        options.variant_id = Some(variant.id);
        max_players = max_players.max(extra.custom_num_players.unwrap_or(2));
        if session.user != self.table.owner {
            let changes = option_changes(&self.table, &options, &name, max_players);
            ensure!(!changes.is_empty(), "There are no new options proposed.");
            let message = server_chat(
                self.table.id,
                &format!(
                    "{} proposes the following options:{changes}",
                    crate::accounts::escape_html(&session.name)
                ),
            );
            let mut next = self.candidate();
            next.chat.push(TableChat {
                id: None,
                user: 0,
                message: message.clone(),
            });
            self.persist(next).await?;
            let mut e = self.effects();
            self.add_all(&mut e, "chat", message);
            if let Some(owner) = self.attendees.get(&self.table.owner) {
                let mut suggestion = server_chat(
                    self.table.id,
                    &options_suggestion(&options, &name, max_players)?,
                );
                suggestion["recipient"] = json!(owner.session.name);
                e.messages
                    .push((owner.session.clone(), frame("chat", suggestion)));
            }
            return self.publish(e).await;
        }
        let mut next = self.candidate();
        next.name = name;
        next.options = options;
        next.max_players = max_players;
        next.extra = extra;
        if !variant_only {
            next.visible = !data["hidePregame"].as_bool().unwrap_or(false);
        }
        let Phase::Pregame {
            players,
            countdown,
            automatic_start,
            ..
        } = &mut next.phase
        else {
            unreachable!()
        };
        let removed = players.split_off(players.len().min(max_players));
        *countdown = None;
        *automatic_start = None;
        for player in players.iter_mut() {
            player.stats = self
                .store
                .player_for_variant(player.id, player.name.clone(), variant.id)
                .await?
                .stats;
        }
        ensure!(
            session.active(),
            "Session changed while refreshing table options"
        );
        if players.iter().all(|p| p.id != next.owner) {
            next.owner = players[0].id;
        }
        let message = server_chat(
            self.table.id,
            &format!(
                "{} has changed {}.",
                crate::accounts::escape_html(&session.name),
                if variant_only {
                    "the variant"
                } else {
                    "game options"
                }
            ),
        );
        next.chat.push(TableChat {
            id: None,
            user: 0,
            message: message.clone(),
        });
        self.persist(next).await?;
        let mut e = self.effects();
        for p in removed {
            if let Some(a) = self.attendees.remove(&p.id) {
                e.statuses.push((a.session.clone(), 0, None));
                e.messages
                    .push((a.session, frame("boot", json!({"TableID":self.table.id}))));
            }
        }
        self.pregame_messages(&mut e);
        self.add_all(&mut e, "chat", message);
        self.publish(e).await
    }
    async fn join(&mut self, session: Arc<Session>, data: &Value) -> Result<()> {
        let Phase::Pregame {
            players, kicked, ..
        } = &self.table.phase
        else {
            bail!("The table has started");
        };
        ensure!(
            !kicked.contains(&session.user),
            "You were kicked from this table"
        );
        ensure!(
            players.len() < self.table.max_players && !players.iter().any(|p| p.id == session.user),
            "Table is full or already joined"
        );
        if let Some(hash) = &self.table.password_hash {
            let hash = hash.clone();
            let password = data["password"].as_str().unwrap_or("").to_owned();
            let valid = crate::accounts::verify_password(password, hash).await?;
            ensure!(valid, "Incorrect table password");
        }
        let variant = hanabi_engine::get_variant(&self.table.options.variant_name)?;
        let player = self
            .store
            .player_for_variant(session.user, session.name.clone(), variant.id)
            .await?;
        ensure!(session.active(), "Session changed during join");
        let mut next = self.candidate();
        if let Phase::Pregame { players, .. } = &mut next.phase {
            players.push(player);
        }
        let message = membership_notice(
            &mut next,
            &format!(
                "{} joined the game.",
                crate::accounts::escape_html(&session.name)
            ),
        );
        next.remember(session.user, data["requestID"].as_str())?;
        self.persist(next).await?;
        self.initialize(session.clone(), vec![]).await?;
        let mut e = self.effects();
        if let Some(message) = message {
            for attendee in self.audience().filter(|a| a.session.user != session.user) {
                e.messages
                    .push((attendee.session.clone(), frame("chat", message.clone())));
            }
        }
        self.publish(e).await
    }
    async fn reattend(
        &mut self,
        session: Arc<Session>,
        data: &Value,
        spectating: bool,
    ) -> Result<()> {
        let replay = matches!(self.table.phase, Phase::Replay { .. });
        let seat = self
            .table
            .players()
            .iter()
            .position(|p| p.id == session.user);
        ensure!(
            spectating || seat.is_some() || replay,
            "You are not a player"
        );
        ensure!(
            !spectating || seat.is_none() || replay,
            "Players cannot spectate their own ongoing game"
        );
        let shadow = if spectating {
            data["shadowingPlayerIndex"]
                .as_i64()
                .and_then(|v| usize::try_from(v).ok())
                .filter(|v| *v < self.table.players().len())
        } else {
            self.table
                .shadows
                .get(&session.user)
                .copied()
                .flatten()
                .and_then(|v| usize::try_from(v).ok())
        };
        let mut next = self.candidate();
        next.shadows.insert(session.user, shadow.map(|v| v as i32));
        if replay {
            next.game_mut().context("Missing replay")?.idle_remaining = IDLE_TIMEOUT_MS;
        }
        self.persist(next).await?;
        let pregame = matches!(self.table.phase, Phase::Pregame { .. });
        if pregame && !spectating && session.active() {
            self.pregame_absent_until.remove(&session.user);
        }
        self.attendees.insert(
            session.user,
            Attendance {
                session: session.clone(),
                loaded: false,
                spectator: spectating || replay,
                shadow,
                typing_until: None,
            },
        );
        let mut e = self.effects();
        e.statuses.push((
            session.clone(),
            if replay {
                if self.table.visible { 5 } else { 4 }
            } else if spectating {
                3
            } else if pregame {
                1
            } else {
                2
            },
            Some(self.table.id),
        ));
        if pregame {
            self.pregame_messages(&mut e);
            e.messages.push((
                session.clone(),
                frame(
                    "joined",
                    json!(TableRequest {
                        table_id: TableId(self.table.id)
                    }),
                ),
            ));
            self.chat_history(&mut e, &session);
        } else {
            e.messages.push((
                session,
                frame(
                    "tableStart",
                    json!(TableStarted {
                        table_id: TableId(self.table.id),
                        replay
                    }),
                ),
            ));
        }
        self.spectator_messages(&mut e);
        self.publish(e).await
    }
    async fn leave(&mut self, session: Arc<Session>, remove: bool) -> Result<()> {
        ensure!(self.attending(&session), "You are not attending this table");
        let mut next = self.candidate();
        let mut notices = vec![];
        next.shadows.remove(&session.user);
        if remove && matches!(next.phase, Phase::Pregame { .. }) {
            notices = remove_pregame_players(&mut next, &HashSet::from([session.user]));
            if next.players().is_empty() {
                return self.retire().await;
            }
        }
        if matches!(next.phase, Phase::Replay { .. })
            && next.owner == session.user
            && let Some(a) = self.audience().find(|a| a.session.user != session.user)
        {
            next.owner = a.session.user;
            if let Phase::Replay { replay, .. } = &mut next.phase {
                replay.leader = next.owner;
            }
        }
        self.persist(next).await?;
        self.attendees.remove(&session.user);
        let mut e = self.effects();
        e.statuses.push((session.clone(), 0, None));
        e.messages.push((
            session,
            frame(
                "left",
                json!(TableRequest {
                    table_id: TableId(self.table.id)
                }),
            ),
        ));
        if matches!(self.table.phase, Phase::Pregame { .. }) {
            self.pregame_messages(&mut e);
        }
        for message in notices {
            self.add_all(&mut e, "chat", message);
        }
        self.spectator_messages(&mut e);
        self.publish(e).await?;
        if matches!(self.table.phase, Phase::Replay { .. }) && self.attendees.is_empty() {
            self.retire().await?;
        }
        Ok(())
    }
    async fn start(&mut self, session: Arc<Session>, request: Option<&str>) -> Result<()> {
        ensure!(
            self.attending(&session) && session.user == self.table.owner,
            "Only the attended owner can start"
        );
        let Phase::Pregame { players, .. } = &self.table.phase else {
            bail!("Already started");
        };
        ensure!(
            (2..=6).contains(&players.len()),
            "You need at least two players"
        );
        ensure!(
            self.table
                .extra
                .custom_num_players
                .is_none_or(|n| n == players.len()),
            "Custom game requires its original player count"
        );
        if self.table.extra.custom_num_players.is_some() {
            ensure!(
                players.iter().all(|p| self
                    .attendees
                    .get(&p.id)
                    .is_some_and(|a| a.session.active() && !a.spectator)),
                "Custom games require all players present"
            );
        }
        let mut players = players.clone();
        let variant = hanabi_engine::get_variant(&self.table.options.variant_name)?;
        let seed = if let Some(seed) = &self.table.extra.custom_seed {
            seed.clone()
        } else {
            self.store
                .next_seed(
                    &players,
                    variant.id,
                    players.len(),
                    &self.table.extra.set_seed_suffix,
                )
                .await?
        };
        let game_id = self.store.reserve().await?;
        let extra = &self.table.extra;
        let mut deck = if let Some(custom) = &extra.custom_deck {
            custom.clone()
        } else {
            hanabi_engine::create_deck(variant)
        };
        if extra.custom_seed.is_some() && !extra.custom_deck_is_shuffled {
            deck = hanabi_engine::create_shuffled_deck(variant, &seed)?;
        }
        let mut rng =
            hanabi_engine::random::GoRandom::new(hanabi_engine::random::seed_hash(&seed)?);
        for i in 0..deck.len() {
            let other = rng.intn(i as u64 + 1) as usize;
            if extra.custom_seed.is_none() && !extra.custom_deck_is_shuffled {
                deck.swap(i, other);
            }
        }
        if extra.custom_seed.is_none() {
            rng.shuffle(&mut players);
        }
        ensure!(session.active(), "Owner disconnected during start");
        let mut options = self.table.options.clone();
        options.num_players = players.len();
        let mut game = Game::create(GameSetup {
            options: options.clone(),
            player_names: players.iter().map(|p| p.name.clone()).collect(),
            seed: seed.clone(),
            deck: Some(deck),
            characters: extra.custom_characters.clone(),
            interpretation: Interpretation::Live,
        })?;
        let emulated = if extra.set_replay {
            &extra.custom_actions[..extra.set_replay_turn.min(extra.custom_actions.len())]
        } else {
            &extra.custom_actions
        };
        for a in emulated {
            if game.end_condition != EndCondition::InProgress {
                break;
            }
            let actor = game.active_player_index;
            if a.kind >= 4 {
                game.terminate(
                    actor,
                    EndCondition::try_from(a.value).map_err(anyhow::Error::msg)?,
                    a.target,
                    None,
                    None,
                )?;
            } else {
                game.apply(actor, a.clone())?;
            }
        }
        let now = Utc::now();
        let n = players.len();
        let size = game.deck.len() + game.stacks.len();
        let snapshot = Snapshot {
            format: FORMAT.into(),
            table_id: self.table.id,
            game_id,
            owner: self.table.owner,
            name: self.table.name.clone(),
            players,
            seed,
            created: self.table.created,
            started: now,
            finished: (game.end_condition != EndCondition::InProgress).then_some(now),
            game,
            clocks: vec![
                if options.timed {
                    (options.time_base * 1000.0) as i64
                } else {
                    0
                };
                n
            ],
            duration: 0,
            turn_elapsed: 0,
            timer_started: false,
            receipts: vec![],
            idle_remaining: IDLE_TIMEOUT_MS,
            pause_player_index: -1,
            queued_pauses: vec![false; n],
            notes: vec![vec![String::new(); size]; n],
            spectator_notes: BTreeMap::new(),
            tags: vec![],
            votes: vec![false; n],
            maintenance_applied: false,
        };
        let mut next = self.candidate();
        next.options = options;
        next.phase = Phase::Live {
            snapshot: Box::new(snapshot),
        };
        next.remember(session.user, request)?;
        self.persist(next).await?;
        for a in self.attendees.values_mut() {
            a.loaded = false;
        }
        let mut e = self.effects();
        let replay = matches!(self.table.phase, Phase::Replay { .. });
        for a in self.audience() {
            e.statuses.push((
                a.session.clone(),
                if replay {
                    5
                } else if a.spectator {
                    3
                } else {
                    2
                },
                Some(self.table.id),
            ));
            e.messages.push((
                a.session.clone(),
                frame(
                    "tableStart",
                    json!(TableStarted {
                        table_id: TableId(self.table.id),
                        replay
                    }),
                ),
            ));
        }
        self.publish(e).await
    }
    fn live(&self) -> Result<&Snapshot> {
        let Phase::Live { snapshot } = &self.table.phase else {
            bail!("Not an ongoing game");
        };
        ensure!(
            snapshot.game.end_condition == EndCondition::InProgress,
            "Game already ended"
        );
        Ok(snapshot)
    }
    async fn action(&mut self, session: Arc<Session>, data: &Value) -> Result<()> {
        ensure!(self.attending(&session), "Reattend before acting");
        let seat = self.seat(&session)?;
        let old = self.live()?;
        let a = Action {
            kind: u8::try_from(data["type"].as_i64().context("Invalid action")?)?,
            target: i32::try_from(data["target"].as_i64().context("Invalid action target")?)?,
            value: i32::try_from(data["value"].as_i64().unwrap_or(0))?,
        };
        hanabi_engine::validate_action(&old.game.0, seat, &hanabi_engine::PlayerAction::from(&a))?;
        let from = old.game.events.len();
        let mut next = self.candidate();
        let s = next.game_mut().expect("game");
        if s.game.options.timed {
            s.clocks[seat] += s.game.options.time_per_turn * 1000;
        }
        let timing = CompletionTiming {
            player_times: s.clocks.clone(),
            duration: s.duration,
        };
        s.game.apply_timed(seat, &a, Some(timing))?;
        s.timer_started = true;
        s.turn_elapsed = 0;
        s.idle_remaining = IDLE_TIMEOUT_MS;
        s.maintenance_applied = false;
        let active = s.game.active_player_index;
        if s.game.end_condition == EndCondition::InProgress && s.queued_pauses[active] {
            s.queued_pauses[active] = false;
            s.pause_player_index = active as i32;
            s.game.paused = true;
        }
        next.remember(session.user, data["requestID"].as_str())?;
        self.persist(next).await?;
        self.transitions(from).await
    }
    async fn transitions(&self, from: usize) -> Result<()> {
        let s = self.table.game().context("Missing game")?;
        let replay = matches!(self.table.phase, Phase::Replay { .. });
        let mut e = self.effects();
        for a in self.audience().filter(|a| a.loaded) {
            let recipient = if let Some(seat) = self
                .table
                .players()
                .iter()
                .position(|p| p.id == a.session.user)
            {
                Recipient::Player {
                    player_index: seat as i32,
                }
            } else {
                Recipient::Spectator {
                    shadowing_player_index: a.shadow.map(|i| i as i32),
                }
            };
            for event in hanabi_engine::events_for_recipient(
                &s.game.0,
                recipient,
                Some(&s.game.events[from..]),
            )? {
                e.messages.push((
                    a.session.clone(),
                    frame(
                        "gameAction",
                        GameActionMessage {
                            table_id: self.table.id,
                            action: &event,
                        },
                    ),
                ));
            }
        }
        if replay {
            self.add_all(&mut e, "connected", self.connected());
            self.spectator_messages(&mut e);
            let count = if s.game_id > 0 {
                self.store.seed_count(&s.seed).await?
            } else {
                0
            };
            for a in self.audience() {
                e.statuses.push((
                    a.session.clone(),
                    if self.table.visible { 5 } else { 4 },
                    Some(self.table.id),
                ));
                if s.players.iter().any(|p| p.id == a.session.user) {
                    e.messages.push((
                        a.session.clone(),
                        frame("gameHistory", json!([s.history(count, true)])),
                    ));
                }
                e.messages.push((a.session.clone(),frame("finishOngoingGame",json!({"tableID":self.table.id,"databaseID":s.game_id,"sharedReplayLeader":self.leader_name()}))));
                e.messages.push((
                    a.session.clone(),
                    frame(
                        "cardIdentities",
                        json!({"tableID":self.table.id,"cardIdentities":s.game.identities()}),
                    ),
                ));
                e.messages.push((
                    a.session.clone(),
                    frame(
                        "noteList",
                        json!({"tableID":self.table.id,"notes":self.observer_notes(a)}),
                    ),
                ));
            }
            self.add_all(&mut e, "clock", self.clock());
        } else {
            self.add_all(&mut e, "clock", self.clock());
            if s.game.paused {
                self.add_all(&mut e,"pause",json!({"tableID":self.table.id,"active":true,"playerIndex":s.pause_player_index}));
            }
        }
        self.publish(e).await
    }
    fn leader_name(&self) -> String {
        self.attendees
            .get(&self.table.owner)
            .map(|a| a.session.name.clone())
            .or_else(|| {
                self.table
                    .players()
                    .iter()
                    .find(|p| p.id == self.table.owner)
                    .map(|p| p.name.clone())
            })
            .unwrap_or_default()
    }
    async fn terminate(
        &mut self,
        session: Arc<Session>,
        request: Option<&str>,
        vote: bool,
    ) -> Result<()> {
        ensure!(self.attending(&session), "You are not attending");
        let seat = self.seat(&session)?;
        let from = self.live()?.game.events.len();
        let mut next = self.candidate();
        let s = next.game_mut().expect("game");
        let mut votes = None;
        let mut terminate = !vote;
        if vote {
            s.votes[seat] = !s.votes[seat];
            let seats = s
                .votes
                .iter()
                .enumerate()
                .filter(|(_, v)| **v)
                .map(|(i, _)| i)
                .collect::<Vec<_>>();
            terminate = if s.players.len() == 2 {
                seats.len() == 2
            } else {
                seats.len() * 2 >= s.players.len()
            };
            votes = Some(seats);
        }
        if terminate {
            s.game.terminate(
                seat,
                if vote {
                    EndCondition::TerminatedByVote
                } else {
                    EndCondition::TerminatedByPlayer
                },
                if vote { -1 } else { seat as i32 },
                votes,
                Some(CompletionTiming {
                    player_times: s.clocks.clone(),
                    duration: s.duration,
                }),
            )?;
        }
        next.remember(session.user, request)?;
        self.persist(next).await?;
        let mut e = self.effects();
        if vote {
            e.messages.push((
                session,
                frame(
                    "voteChange",
                    json!({"vote":self.table.game().expect("game").votes[seat]}),
                ),
            ));
        }
        self.publish(e).await?;
        if terminate {
            self.transitions(from).await?;
        }
        Ok(())
    }
    async fn pause(&mut self, session: Arc<Session>, data: &Value) -> Result<()> {
        ensure!(self.attending(&session), "Not attending");
        let seat = self.seat(&session)?;
        let old = self.live()?;
        ensure!(old.game.options.timed, "This is not a timed game");
        let mut setting = data["setting"].as_str().context("Invalid pause setting")?;
        if setting == "pause-queue" && seat == old.game.active_player_index {
            setting = "pause";
        }
        ensure!(
            match setting {
                "pause" => !old.game.paused,
                "unpause" => old.game.paused,
                "pause-queue" => !old.queued_pauses[seat],
                "pause-unqueue" => old.queued_pauses[seat],
                _ => false,
            },
            "Invalid or already applied pause setting"
        );
        let mut next = self.candidate();
        let s = next.game_mut().expect("game");
        match setting {
            "pause-queue" | "pause-unqueue" => s.queued_pauses[seat] = setting == "pause-queue",
            _ => {
                s.game.paused = setting == "pause";
                s.pause_player_index = if s.game.paused { seat as i32 } else { -1 };
                if !s.game.paused {
                    s.turn_elapsed = 0;
                }
            }
        }
        next.remember(session.user, data["requestID"].as_str())?;
        self.persist(next).await?;
        let s = self.table.game().expect("game");
        let mut e = self.effects();
        if setting == "pause" || setting == "unpause" {
            self.add_all(&mut e,"pause",json!({"tableID":self.table.id,"active":s.game.paused,"playerIndex":s.pause_player_index}));
            self.add_all(&mut e, "clock", self.clock());
        }
        self.publish(e).await
    }
    async fn note(&mut self, session: Arc<Session>, data: &Value) -> Result<()> {
        ensure!(self.attending(&session), "Not attending");
        self.live()?;
        let order = data["order"].as_u64().context("Invalid note order")? as usize;
        let text = crate::accounts::truncate_to_max_bytes(
            data["note"].as_str().context("Invalid note")?,
            300,
        );
        let text = regex::Regex::new(r"[^\p{L}\p{M}\p{N}\p{P}\p{S} ]")?
            .replace_all(text, "")
            .trim()
            .to_owned();
        ensure!(
            crate::accounts::max_consecutive_marks(&text) <= 3,
            "Notes cannot contain more than 3 consecutive diacritics."
        );
        let seat = self
            .table
            .players()
            .iter()
            .position(|p| p.id == session.user);
        let mut next = self.candidate();
        let s = next.game_mut().expect("game");
        let size = s.game.deck.len() + s.game.stacks.len();
        ensure!(order < size, "Invalid note order");
        if let Some(seat) = seat {
            s.notes[seat][order] = text;
        } else {
            s.spectator_notes
                .entry(session.user)
                .or_insert_with(|| NoteOwner {
                    name: session.name.clone(),
                    notes: vec![String::new(); size],
                })
                .notes[order] = text;
        }
        next.remember(session.user, data["requestID"].as_str())?;
        self.persist(next).await?;
        let mut e = self.effects();
        for a in self.audience().filter(|a| a.spectator) {
            let notes=self.observer_notes(a).into_iter().map(|n|json!({"name":n["name"],"text":n["notes"][order],"isSpectator":n["isSpectator"]})).collect::<Vec<_>>();
            e.messages.push((
                a.session.clone(),
                frame(
                    "note",
                    json!({"tableID":self.table.id,"order":order,"notes":notes}),
                ),
            ));
        }
        self.publish(e).await
    }
    fn observer_notes(&self, a: &Attendance) -> Vec<Value> {
        let Some(s) = self.table.game() else {
            return vec![];
        };
        let mut notes = vec![];
        for (i, p) in s.players.iter().enumerate() {
            if a.shadow.is_none_or(|shadow| shadow == i)
                || matches!(self.table.phase, Phase::Replay { .. })
            {
                notes.push(json!({"name":p.name,"notes":s.notes[i],"isSpectator":false}));
            }
        }
        for (id, n) in &s.spectator_notes {
            if *id == a.session.user || a.shadow.is_none() {
                notes.push(json!({"name":n.name,"notes":n.notes,"isSpectator":true}));
            }
        }
        for spectator in self
            .audience()
            .filter(|p| p.spectator && !s.spectator_notes.contains_key(&p.session.user))
        {
            if a.shadow.is_none() || spectator.session.user == a.session.user {
                notes.push(json!({"name":spectator.session.name,"notes":vec!["";s.game.deck.len()+s.game.stacks.len()],"isSpectator":true}));
            }
        }
        notes
    }
    async fn tag(&mut self, session: Arc<Session>, data: &Value, operation: &str) -> Result<()> {
        ensure!(self.attending(&session), "Not attending");
        let raw = data["msg"].as_str().unwrap_or("");
        ensure!(
            raw.len() <= 100,
            "Tags cannot be longer than 100 characters."
        );
        let tag = crate::accounts::normalize_string(
            raw.chars()
                .map(|c| if c.is_whitespace() { ' ' } else { c })
                .collect::<String>()
                .trim(),
        );
        ensure!(
            operation == "tagsDeleteAll" || !tag.is_empty(),
            "Tags cannot be blank."
        );
        let mut next = self.candidate();
        let replay = matches!(next.phase, Phase::Replay { .. });
        let s = next.game_mut().context("No game")?;
        let escaped = crate::accounts::escape_html(&tag);
        if replay {
            ensure!(
                s.game_id > 0,
                "JSON replays do not have a database game to tag."
            );
            s.tags = self
                .store
                .tags_for_game(s.game_id)
                .await?
                .context("That game no longer exists in the database.")?;
            ensure!(
                self.attending(&session),
                "Tag author is no longer at this table."
            );
        }
        let exists = s
            .tags
            .iter()
            .any(|t| t.user == session.user && t.tag == tag);
        if operation == "tag" {
            ensure!(
                !replay || !exists,
                "You have already tagged this game with \"{escaped}\"."
            );
            if !replay {
                s.tags.retain(|t| t.tag != tag);
            }
            s.tags.push(Tag {
                user: session.user,
                tag: tag.clone(),
            });
        } else {
            ensure!(
                operation == "tagsDeleteAll" || exists,
                "The tag of \"{escaped}\" does not exist on this game yet."
            );
            s.tags.retain(|t| {
                if operation == "tagsDeleteAll" {
                    t.user != session.user
                } else if replay {
                    t.user != session.user || t.tag != tag
                } else {
                    t.tag != tag
                }
            });
        }
        if replay {
            ensure!(
                s.game_id > 0,
                "JSON replays cannot be tagged in the database"
            );
            next.pending_tag = Some(PendingTag {
                game_id: s.game_id,
                user_id: session.user,
                operation: operation.into(),
                tag: tag.clone(),
            });
        }
        let verb = if operation == "tag" {
            "added"
        } else {
            "deleted"
        };
        let text = if replay {
            if operation == "tagsDeleteAll" {
                format!(
                    "{} has deleted all their tags for this game.",
                    crate::accounts::escape_html(&session.name)
                )
            } else {
                format!(
                    "{} has {verb} a game tag of \"{escaped}\".",
                    crate::accounts::escape_html(&session.name)
                )
            }
        } else if operation == "tagsDeleteAll" {
            "Successfully deleted all your tags for this game.".into()
        } else {
            format!(
                "Successfully {verb} {} tag of \"{escaped}\".",
                if operation == "tag" { "a" } else { "the" }
            )
        };
        let mut message = server_chat(self.table.id, &text);
        if replay {
            next.chat.push(TableChat {
                id: None,
                user: 0,
                message: message.clone(),
            });
        } else {
            message["room"] = json!(data["room"].as_str().unwrap_or(""));
            message["recipient"] = json!(session.name);
        }
        next.remember(session.user, data["requestID"].as_str())?;
        self.persist(next).await?;
        let mut e = self.effects();
        if replay {
            self.add_all(&mut e, "chat", message);
        } else {
            e.messages.push((session, frame("chat", message)));
        }
        self.publish(e).await
    }
    async fn leader(&mut self, session: Arc<Session>, data: &Value) -> Result<()> {
        ensure!(self.attending(&session), "Not attending");
        let name = data["name"].as_str().context("Missing leader name")?;
        let target = if matches!(self.table.phase, Phase::Replay { .. }) {
            self.audience()
                .find(|a| {
                    crate::accounts::normalize_string(&a.session.name)
                        == crate::accounts::normalize_string(name)
                })
                .map(|a| (a.session.user, a.session.name.clone()))
        } else {
            self.table
                .players()
                .iter()
                .find(|p| {
                    crate::accounts::normalize_string(&p.name)
                        == crate::accounts::normalize_string(name)
                })
                .map(|p| (p.id, p.name.clone()))
        }
        .context("That player is not at this table")?;
        ensure!(
            target.0 != self.table.owner,
            "That player is already the leader"
        );
        ensure!(
            !matches!(self.table.phase, Phase::Replay { .. }) || self.table.visible,
            "Solo replay cannot change leader"
        );
        let mut next = self.candidate();
        next.owner = target.0;
        if let Phase::Pregame { players, .. } = &mut next.phase {
            let seat = players
                .iter()
                .position(|player| player.id == target.0)
                .context("New leader is missing from pregame players")?;
            players.swap(0, seat);
        }
        if let Phase::Replay { replay, .. } = &mut next.phase {
            replay.leader = target.0;
        }
        let message = server_chat(
            self.table.id,
            &format!(
                "{} has passed table ownership to: {}",
                crate::accounts::escape_html(&session.name),
                crate::accounts::escape_html(&target.1)
            ),
        );
        next.chat.push(TableChat {
            id: None,
            user: 0,
            message: message.clone(),
        });
        next.remember(session.user, data["requestID"].as_str())?;
        self.persist(next).await?;
        let mut e = self.effects();
        self.add_all(&mut e, "chat", message);
        self.add_all(
            &mut e,
            "replayLeader",
            json!({"tableID":self.table.id,"name":target.1}),
        );
        if matches!(self.table.phase, Phase::Pregame { .. }) {
            self.pregame_messages(&mut e);
        }
        self.publish(e).await
    }
    async fn suggest(&self, session: Arc<Session>, data: &Value) -> Result<()> {
        ensure!(
            self.attending(&session)
                && matches!(self.table.phase, Phase::Replay { .. })
                && self.table.visible,
            "Not a shared replay"
        );
        let leader = self
            .attendees
            .get(&self.table.owner)
            .filter(|a| a.session.active())
            .context("Leader is not attending")?;
        let mut e = self.effects();
        e.messages.push((
            leader.session.clone(),
            frame(
                "suggestion",
                json!({"tableID":self.table.id,"userName":session.name,"segment":data["segment"]}),
            ),
        ));
        self.publish(e).await
    }
    async fn replay_action(&mut self, session: Arc<Session>, data: &Value) -> Result<()> {
        ensure!(
            self.attending(&session) && session.user == self.table.owner && self.table.visible,
            "You must lead this shared replay"
        );
        let mut next = self.candidate();
        let Phase::Replay { snapshot, replay } = &mut next.phase else {
            bail!("Not a replay");
        };
        let kind = data["type"].as_i64().context("Invalid replay action")?;
        let (command, payload) = match kind {
            0 => {
                let segment = i32::try_from(data["segment"].as_i64().context("Invalid segment")?)?;
                ensure!(segment >= 0, "Invalid segment");
                replay.segment = segment;
                (
                    "replaySegment",
                    json!({"tableID":self.table.id,"segment":segment}),
                )
            }
            1 => (
                "replayIndicator",
                json!({"tableID":self.table.id,"order":data["order"]}),
            ),
            2 => (
                "replaySound",
                json!({"tableID":self.table.id,"sound":data["sound"]}),
            ),
            3 => {
                ensure!(replay.hypothetical.is_none(), "Already hypothetical");
                replay.hypothetical = Some(Box::new(snapshot.game.0.clone()));
                replay.show_drawn_cards = false;
                ("hypoStart", json!({"TableID":self.table.id}))
            }
            4 => {
                ensure!(replay.hypothetical.is_some(), "Not hypothetical");
                replay.hypothetical = None;
                replay.hypothetical_actions.clear();
                ("hypoEnd", json!({"TableID":self.table.id}))
            }
            5 => {
                let raw = data["actionJSON"].as_str().context("Invalid action JSON")?;
                let _: Value = serde_json::from_str(raw)?;
                ensure!(
                    replay.hypothetical_actions.len() < 4096
                        && replay
                            .hypothetical_actions
                            .iter()
                            .map(String::len)
                            .sum::<usize>()
                            + raw.len()
                            <= 4_194_304,
                    "Too many hypothetical actions"
                );
                replay.hypothetical_actions.push(raw.into());
                ("hypoAction", json!(raw))
            }
            6 => {
                replay.hypothetical_actions.pop();
                while replay.hypothetical_actions.last().is_some_and(|v| {
                    serde_json::from_str::<Value>(v).is_ok_and(|v| v["type"] != "turn")
                }) {
                    replay.hypothetical_actions.pop();
                }
                ("hypoBack", json!({"TableID":self.table.id}))
            }
            7 => {
                replay.show_drawn_cards = !replay.show_drawn_cards;
                (
                    "hypoShowDrawnCards",
                    json!({"tableID":self.table.id,"showDrawnCards":replay.show_drawn_cards}),
                )
            }
            8 => {
                replay.efficiency_modifier =
                    i32::try_from(data["value"].as_i64().context("Invalid efficiency")?)?;
                (
                    "replayEfficiencyMod",
                    json!({"tableID":self.table.id,"mod":replay.efficiency_modifier}),
                )
            }
            _ => bail!("Invalid replay action"),
        };
        snapshot.idle_remaining = IDLE_TIMEOUT_MS;
        next.remember(session.user, data["requestID"].as_str())?;
        self.persist(next).await?;
        let mut e = self.effects();
        self.add_all(&mut e, command, payload);
        self.publish(e).await
    }
    async fn chat_presence(&mut self, session: Arc<Session>, typing: bool) -> Result<()> {
        ensure!(self.attending(&session), "Not attending");
        let a = self.attendees.get_mut(&session.user).expect("attendee");
        let notify = typing && a.typing_until.is_none();
        if typing {
            a.typing_until = Some(Instant::now() + Duration::from_secs(2));
        } else {
            self.chat_read.insert(session.user, self.table.chat.len());
        }
        if notify {
            let mut e = self.effects();
            self.typing_messages(&mut e, session.user, &session.name, true);
            self.publish(e).await?;
        }
        Ok(())
    }
    async fn chat(&mut self, session: Arc<Session>, data: &Value) -> Result<()> {
        ensure!(self.attending(&session), "Not attending");
        let text =
            crate::accounts::normalize_chat(data["msg"].as_str().context("Missing chat message")?)
                .map_err(anyhow::Error::msg)?;
        if let Some(response) = crate::lobby::general_response(&text) {
            let responses = match response {
                crate::lobby::GeneralResponse::Private(response) => {
                    let mut e = self.effects();
                    let mut message = server_chat(self.table.id, &response);
                    message["recipient"] = json!(session.name);
                    e.messages.push((session, frame("chat", message)));
                    return self.publish(e).await;
                }
                crate::lobby::GeneralResponse::Public(response) => vec![response],
                crate::lobby::GeneralResponse::Runtime { .. } => data["runtimeResponses"]
                    .as_array()
                    .context("Missing trusted runtime chat response")?
                    .iter()
                    .map(|v| {
                        v.as_str()
                            .map(str::to_owned)
                            .context("Invalid runtime response")
                    })
                    .collect::<Result<Vec<_>>>()?,
            };
            let mut messages = vec![authored_chat(self.table.id, &session.name, &text)];
            messages.extend(
                responses
                    .iter()
                    .map(|response| server_chat(self.table.id, response)),
            );
            let mut next = self.candidate();
            ensure!(
                next.chat.len() + messages.len() <= 4096,
                "Chat history is full"
            );
            for (index, message) in messages.iter().enumerate() {
                next.chat.push(TableChat {
                    id: None,
                    user: if index == 0 { session.user } else { 0 },
                    message: message.clone(),
                });
            }
            next.remember(session.user, data["requestID"].as_str())?;
            self.persist(next).await?;
            let mut e = self.effects();
            for message in messages {
                self.add_all(&mut e, "chat", message);
            }
            return self.publish(e).await;
        }
        // Unknown slash commands are ordinary table messages for bots.
        if matches!(
            crate::lobby::classify_chat(&text),
            crate::lobby::Classification::Public | crate::lobby::Classification::Private
        ) {
            return self
                .chat_command(session, &text, data["publicBaseURL"].as_str().unwrap_or(""))
                .await;
        }
        let message = authored_chat(self.table.id, &session.name, &text);
        let mut next = self.candidate();
        ensure!(next.chat.len() < 4096, "Chat history is full");
        next.chat.push(TableChat {
            id: None,
            user: session.user,
            message: message.clone(),
        });
        next.remember(session.user, data["requestID"].as_str())?;
        self.persist(next).await?;
        let typing = self
            .attendees
            .get_mut(&session.user)
            .is_some_and(|a| a.typing_until.take().is_some());
        let mut e = self.effects();
        self.add_all(&mut e, "chat", message);
        if typing {
            self.typing_messages(&mut e, session.user, &session.name, false);
        }
        self.publish(e).await
    }
    async fn chat_command(
        &mut self,
        session: Arc<Session>,
        text: &str,
        base_url: &str,
    ) -> Result<()> {
        let mut words = text[1..].split_whitespace();
        let command = words.next().unwrap_or("").to_ascii_lowercase();
        let args = words.collect::<Vec<_>>();
        let mut next = self.candidate();
        if [
            "m",
            "missing",
            "missing-scores",
            "missingscores",
            "shared-missing-scores",
            "sharedmissingscores",
        ]
        .contains(&command.as_str())
        {
            let participants = if matches!(self.table.phase, Phase::Replay { .. }) {
                self.audience()
                    .map(|a| (a.session.user, a.session.name.clone()))
                    .collect::<Vec<_>>()
            } else {
                self.table
                    .players()
                    .iter()
                    .map(|p| (p.id, p.name.clone()))
                    .collect::<Vec<_>>()
            };
            ensure!(
                (2..=6).contains(&participants.len()),
                "This command requires two to six participants"
            );
            let message = format!(
                "{}/shared-missing-scores/{}/{}",
                base_url.trim_end_matches('/'),
                participants.len(),
                participants
                    .iter()
                    .map(|(_, n)| url::form_urlencoded::byte_serialize(n.as_bytes())
                        .collect::<String>()
                        .replace('+', "%20"))
                    .collect::<Vec<_>>()
                    .join("/")
            );
            let message = server_chat(self.table.id, &message);
            next.chat.push(TableChat {
                id: None,
                user: 0,
                message: message.clone(),
            });
            self.persist(next).await?;
            let mut e = self.effects();
            self.add_all(&mut e, "chat", message);
            return self.publish(e).await;
        }
        if command == "tags" || command == "taglist" {
            let messages = if !matches!(self.table.phase, Phase::Replay { .. }) {
                vec!["You can only perform this command while in a replay.".to_owned()]
            } else {
                let id = self.table.game().expect("replay game").game_id;
                let tags = self
                    .store
                    .tags_for_game(id)
                    .await?
                    .unwrap_or_default()
                    .into_iter()
                    .map(|t| t.tag)
                    .collect::<std::collections::BTreeSet<_>>();
                if tags.is_empty() {
                    vec!["There are not yet any tags for this game.".to_owned()]
                } else {
                    let mut lines =
                        vec!["The list of tags for this game are as follows:".to_owned()];
                    lines.extend(tags.iter().enumerate().map(|(index, tag)| {
                        format!("{}) {}", index + 1, crate::accounts::escape_html(tag))
                    }));
                    lines
                }
            };
            ensure!(
                self.attending(&session),
                "Tag reader is no longer at this table."
            );
            let messages = messages
                .iter()
                .map(|text| server_chat(self.table.id, text))
                .collect::<Vec<_>>();
            for message in &messages {
                next.chat.push(TableChat {
                    id: None,
                    user: 0,
                    message: message.clone(),
                });
            }
            self.persist(next).await?;
            let mut e = self.effects();
            for message in messages {
                self.add_all(&mut e, "chat", message);
            }
            return self.publish(e).await;
        }
        if command == "suggest" {
            ensure!(args.len() == 1, "Expected /suggest [turn]");
            return self
                .suggest(session, &json!({"segment":args[0].parse::<i32>()?}))
                .await;
        }
        if ["split", "splitauto", "sa"].contains(&command.as_str()) {
            return self.split(session, &args, command != "split").await;
        }
        ensure!(
            session.user == self.table.owner,
            "Only the table owner can use that command"
        );
        let Phase::Pregame {
            players,
            automatic_start,
            countdown,
            kicked,
        } = &mut next.phase
        else {
            bail!("This command requires a pregame table");
        };
        let mut boot = None;
        let notice;
        match command.as_str() {
            "s" | "s2" | "s3" | "s4" | "s5" | "s6" => {
                let n = if let Some(arg) = args.first() {
                    arg.parse::<usize>()?
                } else if command == "s" {
                    players.len() + 1
                } else {
                    command[1..].parse()?
                };
                ensure!((2..=6).contains(&n), "Tables require two to six players");
                *automatic_start = Some(n);
                *countdown = None;
                notice = format!("The game will start as soon as {n} players have joined.");
            }
            "si" | "startin" => {
                ensure!(args.len() == 1, "Expected /startin [minutes]");
                let minutes = parse_start_minutes(args[0]).context("Invalid countdown number")?;
                ensure!(
                    minutes.is_finite() && minutes > 0.0 && minutes <= 10.0,
                    "Minutes must be between zero and ten"
                );
                *countdown =
                    Some(Utc::now() + ChronoDuration::seconds((minutes * 60.0).ceil() as i64));
                let seconds = (minutes * 60.0).ceil() as i64;
                let wait = if seconds < 60 {
                    format!("{seconds} seconds")
                } else if seconds == 60 {
                    "1 minute".into()
                } else {
                    format!("{} minutes", crate::accounts::escape_html(args[0]))
                };
                notice = format!("The game will automatically start in {wait}.");
            }
            "kick" => {
                ensure!(args.len() == 1, "Expected /kick [username]");
                let index = players
                    .iter()
                    .position(|p| {
                        crate::accounts::normalize_string(&p.name)
                            == crate::accounts::normalize_string(args[0])
                    })
                    .context("Player not found")?;
                ensure!(
                    players[index].id != session.user,
                    "You cannot kick yourself"
                );
                let player = players.remove(index);
                notice = format!(
                    "Successfully kicked \"{}\" from the game.",
                    crate::accounts::escape_html(&player.name)
                );
                kicked.push(player.id);
                boot = Some(player.id);
                *countdown = None;
            }
            "impostor" => {
                ensure!(players.len() > 2, "Impostor requires more than two players");
                let chosen = rand::random_range(0..players.len());
                let mut e = self.effects();
                for (i, p) in players.iter().enumerate() {
                    if let Some(a) = self.attendees.get(&p.id) {
                        let mut message = server_chat(
                            self.table.id,
                            if i == chosen {
                                "You are an IMPOSTOR."
                            } else {
                                "You are a CREWMATE."
                            },
                        );
                        message["recipient"] = json!(a.session.name);
                        e.messages.push((a.session.clone(), frame("chat", message)));
                    }
                }
                return self.publish(e).await;
            }
            _ => bail!("Unknown table chat command: /{command}"),
        }
        let authored = authored_chat(self.table.id, &session.name, text);
        let notice = server_chat(self.table.id, &notice);
        next.chat.push(TableChat {
            id: None,
            user: session.user,
            message: authored.clone(),
        });
        next.chat.push(TableChat {
            id: None,
            user: 0,
            message: notice.clone(),
        });
        self.persist(next).await?;
        let mut e = self.effects();
        if let Some(user) = boot
            && let Some(a) = self.attendees.remove(&user)
        {
            e.statuses.push((a.session.clone(), 0, None));
            e.messages
                .push((a.session, frame("boot", json!({"TableID":self.table.id}))));
        }
        self.pregame_messages(&mut e);
        self.add_all(&mut e, "chat", authored);
        self.add_all(&mut e, "chat", notice);
        self.publish(e).await
    }
    async fn allocation(&self) -> Result<Allocation> {
        let (reply, received) = oneshot::channel();
        self.hub.send(HubCommand::Allocate(reply)).await?;
        received.await?
    }
    async fn transfer(
        &mut self,
        mut source: TableSnapshot,
        destination: TableSnapshot,
        mut allocation: Allocation,
        moving: Vec<(Arc<Session>, bool, Option<usize>)>,
        retire: bool,
    ) -> Result<()> {
        let humans = destination
            .players()
            .iter()
            .filter(|p| !p.name.starts_with("Bot-"))
            .map(|p| p.id)
            .collect::<Vec<_>>();
        for user in &humans {
            allocation
                .playing_claims
                .push(PlayingClaim::acquire(&self.playing_claims, *user)?);
        }
        let (reply, received) = oneshot::channel();
        self.hub
            .send(HubCommand::CheckPlaying {
                users: humans,
                except: self.table.id,
                reply,
            })
            .await?;
        received.await??;
        source.pending_spawn = Some(Box::new(destination.clone()));
        source.retire_after_spawn = retire;
        // The source is the durable transfer journal. Recovery can finish a
        // destination reservation that had no payload when the process stopped.
        self.persist(source).await?;
        let destination_revision = match self.store.save(&destination, 0).await {
            Ok(r) => r,
            Err(e) => {
                self.frozen = true;
                return Err(e);
            }
        };
        allocation.revision = destination_revision;
        if retire {
            if let Err(e) = self.store.remove(self.table.id, self.revision).await {
                self.frozen = true;
                return Err(e);
            }
        } else {
            let mut final_source = self.table.clone();
            final_source.pending_spawn = None;
            final_source.retire_after_spawn = false;
            self.persist(final_source).await?;
        }
        allocation.preserve();
        let mut effects = self.effects();
        for (session, _, _) in &moving {
            self.attendees.remove(&session.user);
            effects.messages.push((
                session.clone(),
                frame("boot", json!({"TableID":self.table.id})),
            ));
            effects.statuses.push((session.clone(), 0, None));
        }
        self.pregame_messages(&mut effects);
        self.publish(effects).await?;
        if retire {
            self.hub.send(HubCommand::Retire(self.table.id)).await?;
            self.retired = true;
        }
        self.hub
            .send(HubCommand::Spawn {
                table: Box::new(destination),
                revision: destination_revision,
                allocation,
                chat_read: moving
                    .iter()
                    .filter_map(|(session, _, _)| {
                        self.chat_read
                            .get(&session.user)
                            .map(|read| (session.user, *read))
                    })
                    .collect(),
                attendees: moving,
            })
            .await?;
        Ok(())
    }
    async fn split(&mut self, session: Arc<Session>, args: &[&str], automatic: bool) -> Result<()> {
        ensure!(
            self.attending(&session) && session.user == self.table.owner,
            "Only owner can split"
        );
        let Phase::Pregame { players, .. } = &self.table.phase else {
            bail!("Split requires a pregame");
        };
        let selected = if automatic {
            ensure!(players.len() >= 2, "At least two players required");
            let mut sorted = players.clone();
            sorted.sort_by_key(|p| std::cmp::Reverse(p.stats["numGames"].as_u64().unwrap_or(0)));
            let mid = sorted.len() / 2;
            if sorted[..mid].iter().any(|p| p.id == self.table.owner) {
                sorted[mid..].to_vec()
            } else {
                sorted[..mid].to_vec()
            }
        } else {
            ensure!(!args.is_empty(), "Expected /split [username] ...");
            let mut selected = vec![];
            for name in args {
                let player = players
                    .iter()
                    .find(|p| {
                        crate::accounts::normalize_string(&p.name)
                            == crate::accounts::normalize_string(name)
                    })
                    .context("Unknown split player")?;
                ensure!(
                    !selected.iter().any(|p: &Player| p.id == player.id),
                    "Duplicate split player"
                );
                selected.push(player.clone());
            }
            selected
        };
        ensure!(
            !selected.is_empty() && selected.len() <= self.table.max_players,
            "Invalid split size"
        );
        let selected_ids = selected
            .iter()
            .map(|p| p.id)
            .collect::<std::collections::HashSet<_>>();
        let allocation = self.allocation().await?;
        ensure!(session.active(), "Owner changed while splitting");
        let mut source = self.candidate();
        let Phase::Pregame {
            players,
            countdown,
            automatic_start,
            ..
        } = &mut source.phase
        else {
            unreachable!()
        };
        players.retain(|p| !selected_ids.contains(&p.id));
        *countdown = None;
        *automatic_start = None;
        if selected_ids.contains(&source.owner)
            && let Some(p) = players.first()
        {
            source.owner = p.id;
        }
        let retire = players.is_empty();
        let mut destination = self.table.clone();
        destination.id = allocation.id;
        destination.name = format!(
            "{} (split)",
            crate::accounts::truncate_to_max_bytes(self.table.name.trim(), 37)
        );
        destination.owner = selected[0].id;
        destination.created = Utc::now();
        destination.phase = Phase::Pregame {
            players: selected,
            automatic_start: None,
            countdown: None,
            kicked: vec![],
        };
        destination.chat.clear();
        destination.chat_archived = 0;
        destination.receipts.clear();
        destination.shadows.clear();
        let moving = self
            .audience()
            .filter(|a| selected_ids.contains(&a.session.user))
            .map(|a| (a.session.clone(), false, None))
            .collect();
        self.transfer(source, destination, allocation, moving, retire)
            .await
    }
    async fn restart(&mut self, session: Arc<Session>, data: &Value) -> Result<()> {
        ensure!(
            self.attending(&session)
                && session.user == self.table.owner
                && self.table.visible
                && matches!(self.table.phase, Phase::Replay { .. }),
            "Only the shared replay leader can restart"
        );
        self.seat(&session)?;
        ensure!(
            !self.table.name.starts_with("!replay"),
            "Cannot restart !replay games"
        );
        let hide = data["hidePregame"].as_bool().unwrap_or(false);
        let mut players = self
            .table
            .players()
            .iter()
            .filter(|p| {
                self.attendees
                    .get(&p.id)
                    .is_some_and(|a| a.session.active())
            })
            .cloned()
            .collect::<Vec<_>>();
        ensure!(
            players.len() >= 2 && (!hide || players.len() == self.table.players().len()),
            "Original players must attend to restart"
        );
        let snapshot = self.table.game().context("Missing completed game")?;
        if snapshot.game_id > 0 && !self.table.extra.no_write_to_database {
            // The replay may be visible before its background statistics finish.
            self.store.refresh(snapshot).await?;
        }
        let variant = hanabi_engine::get_variant(&self.table.options.variant_name)?;
        for player in &mut players {
            player.stats = self
                .store
                .player_for_variant(player.id, player.name.clone(), variant.id)
                .await?
                .stats;
        }
        ensure!(
            session.active(),
            "Session changed while refreshing restart statistics"
        );
        let allocation = self.allocation().await?;
        let mut destination = self.table.clone();
        destination.id = allocation.id;
        destination.created = Utc::now();
        destination.name = if let Some(seed) = self.table.name.strip_prefix("!seed ") {
            let split = seed
                .rfind(|c: char| !c.is_ascii_digit())
                .map_or(0, |i| i + 1);
            let (prefix, number) = seed.split_at(split);
            if number.is_empty() {
                format!("!seed {seed}1")
            } else {
                format!(
                    "!seed {prefix}{:0width$}",
                    number
                        .parse::<u64>()?
                        .checked_add(1)
                        .context("Seed suffix exhausted")?,
                    width = number.len()
                )
            }
        } else {
            let pattern = regex::Regex::new(r"^(.*) \(#(\d+)\)$")?;
            let (base, count) = if let Some(m) = pattern.captures(&self.table.name) {
                (m[1].to_owned(), m[2].parse::<u64>()? + 1)
            } else {
                (self.table.name.clone(), 2)
            };
            let suffix = format!(" (#{count})");
            format!(
                "{}{suffix}",
                crate::accounts::truncate_to_max_bytes(&base, 45 - suffix.len())
            )
        };
        destination.extra = ExtraOptions {
            set_seed_suffix: destination.name.strip_prefix("!seed ").unwrap_or("").into(),
            ..ExtraOptions::default()
        };
        destination.receipts.clear();
        destination.shadows.clear();
        destination.phase = Phase::Pregame {
            automatic_start: hide.then_some(players.len()),
            players,
            countdown: None,
            kicked: vec![],
        };
        let moving = self
            .audience()
            .map(|a| {
                let spectator = destination.players().iter().all(|p| p.id != a.session.user);
                (a.session.clone(), spectator, None)
            })
            .collect();
        self.transfer(self.candidate(), destination, allocation, moving, true)
            .await
    }
    async fn info(&self, session: Arc<Session>, part: u8) -> Result<()> {
        ensure!(
            self.attending(&session),
            "Reattend before requesting private game data"
        );
        let s = self.table.game().context("No available game")?;
        let a = self.attendees.get(&session.user).expect("attendee");
        let replay = matches!(self.table.phase, Phase::Replay { .. });
        let seat = s.players.iter().position(|p| p.id == session.user);
        let display_seat = seat.or_else(|| s.players.iter().position(|p| p.name == session.name));
        let mut e = self.effects();
        if part == 1 {
            let (segment, efficiency) = if let Phase::Replay { replay, .. } = &self.table.phase {
                (replay.segment, replay.efficiency_modifier)
            } else {
                (s.game.turn, 0)
            };
            e.messages.push((session.clone(),frame("init",json!({"tableID":self.table.id,"playerNames":s.players.iter().map(|p|p.name.clone()).collect::<Vec<_>>(),"ourPlayerIndex":a.shadow.or(display_seat).unwrap_or(0),"spectating":a.spectator&&!replay,"shadowing":a.shadow.is_some()&&!replay,"replay":replay,"databaseID":if replay{s.game_id}else{-1},"hasCustomSeed":self.table.extra.custom_seed.is_some(),"seed":s.seed,"datetimeStarted":s.started,"datetimeFinished":s.finished.map(|d|d.to_rfc3339()).unwrap_or_else(||"0001-01-01T00:00:00Z".into()),"options":s.game.options,"characterAssignments":if s.game.options.detrimental_characters{s.game.players.iter().map(|p|hanabi_engine::characters().iter().find(|c|c.name==p.character).map_or(-1,|c|c.id as i32)).collect::<Vec<_>>()}else{vec![]},"characterMetadata":if s.game.options.detrimental_characters{s.game.players.iter().map(|p|p.character_metadata).collect::<Vec<_>>()}else{vec![]},"sharedReplay":replay&&self.table.visible,"sharedReplayLeader":self.leader_name(),"sharedReplaySegment":segment,"sharedReplayEffMod":efficiency,"paused":s.game.paused,"pausePlayerIndex":s.pause_player_index,"pauseQueued":seat.is_some_and(|i|s.queued_pauses[i])}))));
        } else {
            let recipient = if replay {
                Recipient::Spectator {
                    shadowing_player_index: None,
                }
            } else if !a.spectator {
                Recipient::Player {
                    player_index: seat.context("Missing player")? as i32,
                }
            } else {
                Recipient::Spectator {
                    shadowing_player_index: a.shadow.map(|i| i as i32),
                }
            };
            let list = hanabi_engine::events_for_recipient(&s.game.0, recipient, None)?;
            e.messages.push((
                session.clone(),
                frame(
                    "gameActionList",
                    GameActionListMessage {
                        table_id: self.table.id,
                        list: &list,
                    },
                ),
            ));
            if replay {
                e.messages.push((
                    session.clone(),
                    frame(
                        "cardIdentities",
                        json!({"tableID":self.table.id,"cardIdentities":s.game.identities()}),
                    ),
                ));
            }
            if replay || a.spectator {
                e.messages.push((
                    session.clone(),
                    frame(
                        "noteList",
                        json!({"tableID":self.table.id,"notes":self.observer_notes(a)}),
                    ),
                ));
            } else if let Some(seat) = seat {
                e.messages.push((
                    session.clone(),
                    frame(
                        "noteListPlayer",
                        json!({"tableID":self.table.id,"notes":s.notes[seat]}),
                    ),
                ));
                e.messages.push((
                    session.clone(),
                    frame("voteChange", json!({"vote":s.votes[seat]})),
                ));
            }
            e.messages
                .push((session.clone(), frame("connected", self.connected())));
            if !replay {
                e.messages
                    .push((session.clone(), frame("clock", self.clock())));
            }
            self.chat_history(&mut e, &session);
            e.messages.push((
                session.clone(),
                frame(
                    "spectators",
                    json!({"tableID":self.table.id,"spectators":self.spectators()}),
                ),
            ));
            for a in self
                .audience()
                .filter(|a| a.session.user != session.user && a.typing_until.is_some())
            {
                e.messages.push((
                    session.clone(),
                    frame(
                        "chatTyping",
                        ChatTyping {
                            table_id: TableId(self.table.id),
                            name: a.session.name.clone(),
                            typing: true,
                        },
                    ),
                ));
            }
            if let Phase::Replay { replay, .. } = &self.table.phase
                && replay.hypothetical.is_some()
            {
                e.messages.push((session,frame("hypothetical",json!({"showDrawnCards":replay.show_drawn_cards,"actions":replay.hypothetical_actions}))));
            }
        }
        self.publish(e).await
    }
    async fn tick(&mut self) -> Result<()> {
        self.cleanup(Instant::now()).await?;
        if self.retired {
            return Ok(());
        }
        let mut expired = vec![];
        for a in self.attendees.values_mut() {
            if a.typing_until.is_some_and(|t| Instant::now() >= t) {
                a.typing_until = None;
                expired.push((a.session.user, a.session.name.clone()));
            }
        }
        if !expired.is_empty() {
            let mut e = self.effects();
            for (id, name) in expired {
                self.typing_messages(&mut e, id, &name, false);
            }
            self.publish(e).await?;
        }
        if let Phase::Pregame {
            players,
            automatic_start,
            countdown,
            ..
        } = &self.table.phase
        {
            let due = automatic_start.is_some_and(|n| n == players.len())
                || countdown.is_some_and(|t| Utc::now() >= t);
            if due
                && let Some(owner) = self
                    .attendees
                    .get(&self.table.owner)
                    .filter(|a| a.session.active())
            {
                let owner = owner.session.clone();
                return self.start(owner, None).await;
            }
            return Ok(());
        }
        let mut next = self.candidate();
        let replay = matches!(next.phase, Phase::Replay { .. });
        let s = next.game_mut().expect("game");
        if replay {
            if s.idle_remaining == 0 {
                return self.retire().await;
            }
            return Ok(());
        }
        if s.game.end_condition != EndCondition::InProgress {
            return Ok(());
        }
        let active = s.game.active_player_index;
        let idle = s.idle_remaining == 0;
        let timeout =
            s.game.options.timed && s.timer_started && !s.game.paused && s.clocks[active] <= 0;
        if idle || timeout {
            let from = s.game.events.len();
            if timeout {
                s.clocks[active] = 0;
            }
            s.game.terminate(
                active,
                if idle {
                    EndCondition::IdleTimeout
                } else {
                    EndCondition::Timeout
                },
                if idle { -1 } else { active as i32 },
                None,
                Some(CompletionTiming {
                    player_times: s.clocks.clone(),
                    duration: s.duration,
                }),
            )?;
            self.persist(next).await?;
            self.transitions(from).await?;
        }
        Ok(())
    }
    async fn retire(&mut self) -> Result<()> {
        self.store.check_state()?;
        ensure!(!self.frozen, "Frozen table cannot be removed");
        if let Err(e) = self.store.remove(self.table.id, self.revision).await {
            self.frozen = true;
            return Err(e);
        }
        let mut e = self.effects();
        for a in self.audience() {
            e.statuses.push((a.session.clone(), 0, None));
            e.messages.push((
                a.session.clone(),
                frame("boot", json!({"TableID":self.table.id})),
            ));
        }
        self.publish(e).await?;
        self.hub.send(HubCommand::Retire(self.table.id)).await?;
        self.retired = true;
        Ok(())
    }
    async fn operation(&mut self, operation: TableOperation) -> Result<Value> {
        self.store.check_state()?;
        ensure!(!self.frozen, "Table frozen until recovery");
        match operation {
            TableOperation::Notice(message) => {
                let mut next = self.candidate();
                let message = server_chat(self.table.id, &message);
                next.chat.push(TableChat {
                    id: None,
                    user: 0,
                    message: message.clone(),
                });
                self.persist(next).await?;
                let mut e = self.effects();
                self.add_all(&mut e, "chat", message);
                self.publish(e).await?;
                Ok(json!({"sent":true}))
            }
            TableOperation::Terminate => {
                if !matches!(self.table.phase, Phase::Live { .. }) {
                    return Ok(json!({"terminated":false}));
                }
                let mut next = self.candidate();
                let s = next.game_mut().expect("game");
                let from = s.game.events.len();
                s.game.terminate(
                    s.game.active_player_index,
                    EndCondition::TerminatedByPlayer,
                    -1,
                    None,
                    Some(CompletionTiming {
                        player_times: s.clocks.clone(),
                        duration: s.duration,
                    }),
                )?;
                self.persist(next).await?;
                self.transitions(from).await?;
                Ok(json!({"terminated":true}))
            }
            TableOperation::Clear { pregames, empty } => {
                let clear = (pregames && matches!(self.table.phase, Phase::Pregame { .. }))
                    || (empty
                        && self.attendees.is_empty()
                        && !matches!(self.table.phase, Phase::Live { .. }));
                if clear {
                    self.retire().await?;
                }
                Ok(json!({"removed":clear}))
            }
            TableOperation::Kick(user) => {
                if let Some(a) = self.attendees.remove(&user) {
                    a.session.cancel.cancel();
                }
                Ok(json!({}))
            }
        }
    }
}
