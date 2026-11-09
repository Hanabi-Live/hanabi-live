use super::{
    Allocation, Command, Entry, HubCommand, NO_SHADOWED_SEAT, PlayingClaim, Presence, Reply,
    TableActor, TableCommand, TableHandle, TableView,
    setup::{Creation, prepare_table, replay_table},
};
use crate::{
    lobby::{Effect, OnlineUser},
    operations::Operation,
    server_info::ServerInfo,
    store::Store,
    transport::{Session, frame},
};
use anyhow::{Context, Result, bail, ensure};
use hanabi_protocol::{
    ClientMessage, ErrorNotice, SoundLobby, Status, TableId, TableRequest, User, UserId, UserLeft,
    UserList,
};
use serde_json::{Value, json};
use std::{
    collections::{HashMap, HashSet},
    sync::{Arc, Mutex},
    time::Duration,
};
use tokio::sync::{Semaphore, mpsc, oneshot};
use tokio_util::task::TaskTracker;

/// The commands the hub queues before senders wait.
const HUB_QUEUE: usize = 512;
/// The most tables open at once.
const MAX_TABLES: usize = 256;
/// The commands a table queues before senders wait.
const TABLE_QUEUE: usize = 64;
/// How long a graceful restart waits for connections to receive their closing messages.
const RESTART_CLOSE_TIMEOUT: Duration = Duration::from_secs(1);

pub struct Hub {
    pub(super) receiver: mpsc::Receiver<HubCommand>,
    pub(super) sender: mpsc::Sender<HubCommand>,
    pub(super) sessions: HashMap<i32, Presence>,
    pub(super) tables: HashMap<u64, Entry>,
    pub(super) closing: bool,
    pub(super) store: Store,
    pub(super) tasks: TaskTracker,
    pub(super) capacity: Arc<Semaphore>,
    pub(super) playing_claims: Arc<Mutex<HashSet<i32>>>,
    pub(super) info: Arc<ServerInfo>,
}
impl Hub {
    pub async fn start(
        store: Store,
        tasks: TaskTracker,
        info: Arc<ServerInfo>,
    ) -> Result<mpsc::Sender<HubCommand>> {
        let restored = store.load_for_startup().await?;
        let (sender, receiver) = mpsc::channel(HUB_QUEUE);
        let mut hub = Self {
            receiver,
            sender: sender.clone(),
            sessions: HashMap::new(),
            tables: HashMap::new(),
            closing: false,
            store,
            tasks: tasks.clone(),
            capacity: Arc::new(Semaphore::new(MAX_TABLES)),
            playing_claims: Arc::new(Mutex::new(HashSet::new())),
            info,
        };
        for (table, revision) in restored {
            let permit = hub
                .capacity
                .clone()
                .try_acquire_owned()
                .context("Recovery table capacity exhausted")?;
            let actor = TableActor::new(
                table,
                revision,
                hub.store.clone(),
                sender.clone(),
                permit,
                hub.info.clone(),
            );
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
        let (sender, receiver) = mpsc::channel(TABLE_QUEUE);
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
    fn user(p: &Presence) -> User {
        User {
            user_id: UserId(p.session.user),
            name: p.session.name.clone(),
            status: p.status,
            table_id: if p.status == Status::Replay {
                Some(TableId(0))
            } else {
                p.table.map(TableId)
            },
            h_group: p.session.h_group(),
            inactive: p.session.inactive(),
        }
    }
    fn broadcast(&self, message: &str) {
        for p in self.sessions.values() {
            if self.current(&p.session) {
                p.session.emit(message);
            }
        }
    }
    fn table_for(v: &TableView, user: i32) -> hanabi_protocol::Table {
        let mut data = v.data.clone();
        data.joined = v.players.contains(&user);
        data
    }
    fn playing_elsewhere(&self, user: i32, except: Option<u64>) -> bool {
        self.tables.iter().any(|(id, entry)| {
            Some(*id) != except && !entry.view.replay && entry.view.players.contains(&user)
        })
    }
    fn route(&self, s: Arc<Session>, id: u64, command: Command, reply: Reply) {
        if self.closing || !self.current(&s) {
            let _ = reply.send(Err(rejection!("Stale session or draining server")));
            return;
        }
        let joining = matches!(&command, Command::Client(message) if matches!(**message, ClientMessage::TableJoin(_)));
        if joining && !s.name.starts_with("Bot-") && self.playing_elsewhere(s.user, Some(id)) {
            let _ = reply.send(Err(rejection!(
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
                        .unwrap_or_else(|_| Err(rejection!("Table closed")));
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
            let _ = reply.send(Err(rejection!("Unknown table")));
        }
    }
    /// A shared replay of the same database game that a link to it should join.
    fn existing_replay(&self, r: &hanabi_protocol::ReplayCreateRequest) -> Option<u64> {
        if !r.join_existing
            || r.visibility != hanabi_protocol::ReplayVisibility::Shared
            || r.source != hanabi_protocol::ReplaySource::Id
        {
            return None;
        }
        let game = r.database_id?;
        self.tables
            .iter()
            .filter(|(_, e)| e.view.replay && e.view.visible && e.view.replay_game == Some(game))
            .map(|(id, _)| *id)
            .min()
    }
    fn create(&self, s: Arc<Session>, creation: Creation, reply: Reply) {
        if self.closing || !self.current(&s) {
            let message = if self.closing {
                "The server is shutting down."
            } else {
                "Your session is no longer current."
            };
            let _ = reply.send(Err(rejection!("{message}")));
            return;
        }
        let playing = matches!(creation, Creation::Table(_)) && !s.name.starts_with("Bot-");
        if playing && self.playing_elsewhere(s.user, None) {
            let _ = reply.send(Err(rejection!("You cannot join more than one table at a time. Terminate your other game before creating a new one.")));
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
        let Ok(permit) = self.capacity.clone().try_acquire_owned() else {
            let _ = reply.send(Err(rejection!(
                "The server has reached its limit of {MAX_TABLES} open tables. Please try again later."
            )));
            return;
        };
        let store = self.store.clone();
        let hub = self.sender.clone();
        let tasks = self.tasks.clone();
        self.tasks.spawn(async move {
            let prepared = prepare_table(&store, &s, creation).await;
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
            ensure_or_reject!(self.current(s), "Stale session");
        }
        for effect in effects {
            match effect {
                Effect::Broadcast(message) => self.broadcast(&message.frame()),
                Effect::ToSelf(message) => {
                    let s = session.context("External effects must be public")?;
                    s.emit(&message.frame());
                }
                Effect::ToUser {
                    id,
                    generation,
                    message,
                } => {
                    ensure!(session.is_some(), "External private effect rejected");
                    if let Some(p) = self
                        .sessions
                        .get(&id)
                        .filter(|p| p.session.generation == generation && p.session.active())
                    {
                        p.session.emit(&message.frame());
                    }
                }
                Effect::HGroup(value) => {
                    let s = session.context("Missing session")?;
                    s.set_h_group(value);
                    if let Some(p) = self.sessions.get(&s.user) {
                        self.broadcast(&frame(hanabi_protocol::server::USER, Self::user(p)));
                    }
                }
                Effect::Inactive(value) => {
                    let s = session.context("Missing session")?;
                    s.set_inactive(value);
                    if let Some(p) = self.sessions.get(&s.user) {
                        self.broadcast(&frame(hanabi_protocol::server::USER, Self::user(p)));
                    }
                }
                Effect::RelationshipChanged { .. } => {
                    ensure!(session.is_some(), "External relationship effect rejected");
                }
                Effect::BlocksChanged {
                    user_id,
                    target_id,
                    blocked,
                } => {
                    ensure!(session.is_some(), "External block effect rejected");
                    for (user, other) in [(user_id, target_id), (target_id, user_id)] {
                        if let Some(p) = self.sessions.get(&user) {
                            p.session.set_blocked(other, blocked);
                        }
                    }
                }
                _ => bail!("Runtime effects must be resolved before hub publication"),
            }
        }
        Ok(())
    }
    fn disconnect(&mut self, users: &[i32]) {
        for user in users {
            if let Some(p) = self.sessions.remove(user) {
                p.session.cancel.cancel();
                self.broadcast(&frame(
                    hanabi_protocol::server::USER_LEFT,
                    UserLeft {
                        user_id: UserId(*user),
                    },
                ));
            }
        }
        for e in self.tables.values() {
            e.handle.cleanup.notify_one();
        }
    }
    fn operations(&mut self, command: Operation, reply: oneshot::Sender<Result<Value>>) {
        if let Err(error) = self.store.check_state() {
            let _ = reply.send(Err(error));
            return;
        }
        if let Operation::Drained { reconnect, message } = command {
            let messages = [
                frame(
                    hanabi_protocol::server::SOUND_LOBBY,
                    SoundLobby {
                        file: hanabi_protocol::LobbySound::Shutdown,
                    },
                ),
                if reconnect {
                    frame(
                        hanabi_protocol::server::RESTART,
                        hanabi_protocol::Restart { message },
                    )
                } else {
                    frame(
                        hanabi_protocol::server::ERROR,
                        ErrorNotice {
                            error: "The server is going down for maintenance. Your accepted game progress has been saved.<br />Please reconnect after the server restarts.".into(),
                        },
                    )
                },
            ];
            let total = self.sessions.len();
            let receipts = self
                .sessions
                .values()
                .filter_map(|p| {
                    p.session
                        .close_after(&messages, crate::transport::SERVICE_RESTART_CLOSE_CODE)
                })
                .collect::<Vec<_>>();
            self.tasks.spawn(async move {
                let closed = match tokio::time::timeout(
                    RESTART_CLOSE_TIMEOUT,
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
        let result = match command {
            Operation::Drained { .. } => unreachable!("handled before dispatch"),
            Operation::Inspect => Ok(
                json!({"users":self.sessions.values().map(Self::user).collect::<Vec<_>>(),"tables":self.tables.values().map(|e|e.view.inspection).collect::<Vec<_>>(),"activeGames":self.tables.values().filter(|e|e.view.inspection.running&&!e.view.inspection.replay&&!e.view.inspection.frozen).count()}),
            ),
            Operation::Mute { user_id } => {
                self.disconnect(&[user_id]);
                Ok(json!({}))
            }
            Operation::Ban { user_id, ip } => {
                // Bans apply to an IP address, which is checked when connecting rather than on
                // every command, so also disconnect other accounts using that address.
                let mut users = vec![user_id];
                if !ip.is_empty() {
                    users.extend(
                        self.sessions
                            .iter()
                            .filter(|(id, p)| **id != user_id && p.session.ip == ip)
                            .map(|(id, _)| *id),
                    );
                }
                self.disconnect(&users);
                Ok(json!({}))
            }
        };
        let _ = reply.send(result);
    }
    pub(super) async fn run(mut self) {
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
                        let _ = reply.send(Err(rejection!("Stale or draining session")));
                        continue;
                    }
                    if let Some(old) = self.sessions.remove(&session.user) {
                        old.session.supersede();
                    }
                    for entry in self.tables.values() {
                        entry.handle.cleanup.notify_one();
                    }
                    welcome.playing_at_tables = self
                        .tables
                        .iter()
                        .filter(|(_, e)| !e.view.replay && e.view.players.contains(&session.user))
                        .map(|(id, _)| TableId(*id))
                        .collect();
                    if let Some((id, shadow)) = self.tables.iter().find_map(|(id, e)| {
                        e.view
                            .reconnects
                            .get(&session.user)
                            .map(|shadow| (*id, *shadow))
                    }) {
                        welcome.discon_spectating_table = Some(TableId(id));
                        welcome.discon_shadowing_seat = Some(
                            shadow
                                .and_then(|seat| i8::try_from(seat).ok())
                                .unwrap_or(NO_SHADOWED_SEAT),
                        );
                    }
                    self.sessions.insert(
                        session.user,
                        Presence {
                            session: session.clone(),
                            status: Status::Lobby,
                            table: None,
                        },
                    );
                    session.emit(&frame(hanabi_protocol::server::WELCOME, welcome));
                    session.emit(&frame(
                        hanabi_protocol::server::USER_LIST,
                        UserList(self.sessions.values().map(Self::user).collect()),
                    ));
                    session.emit(&frame(
                        hanabi_protocol::server::TABLE_LIST,
                        hanabi_protocol::TableList(
                            self.tables
                                .values()
                                .filter(|e| e.view.visible)
                                .map(|e| Self::table_for(&e.view, session.user))
                                .collect(),
                        ),
                    ));
                    for message in initial {
                        session.emit(&message);
                    }
                    if let Some(p) = self.sessions.get(&session.user) {
                        self.broadcast(&frame(hanabi_protocol::server::USER, Self::user(p)));
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
                        self.broadcast(&frame(
                            hanabi_protocol::server::USER_LEFT,
                            UserLeft {
                                user_id: UserId(s.user),
                            },
                        ));
                    }
                    for e in self.tables.values() {
                        e.handle.cleanup.notify_one();
                    }
                }
                HubCommand::Directory {
                    session,
                    users,
                    reply,
                } => {
                    let result = if !self.current(&session) {
                        Err(rejection!("Stale session"))
                    } else if !users {
                        Ok(Vec::new())
                    } else {
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
                    let result = if self.closing {
                        Err(rejection!("The server is shutting down."))
                    } else if users
                        .iter()
                        .any(|user| self.playing_elsewhere(*user, Some(except)))
                    {
                        Err(rejection!(
                            "An original player is already playing at another table."
                        ))
                    } else {
                        Ok(())
                    };
                    let _ = reply.send(result);
                }
                HubCommand::Operations { command, reply } => self.operations(command, reply),
                HubCommand::Client {
                    session,
                    message,
                    reply,
                } => match message {
                    ClientMessage::TableCreate(r) => {
                        self.create(session, Creation::Table(r), reply);
                    }
                    ClientMessage::ReplayCreate(r) => {
                        if let Some(id) = self.existing_replay(&r) {
                            self.route(
                                session,
                                id,
                                Command::Client(Box::new(ClientMessage::TableSpectate(
                                    hanabi_protocol::TableSpectateRequest {
                                        table_id: TableId(id),
                                        shadowing_player_index: r.shadowing_player_index,
                                    },
                                ))),
                                reply,
                            );
                        } else {
                            self.create(session, Creation::Replay(r), reply);
                        }
                    }
                    message => {
                        if let Some(table) = table_target(&message) {
                            self.route(session, table, Command::Client(Box::new(message)), reply);
                        } else {
                            let _ = reply.send(Err(anyhow::anyhow!("Missing tableID")));
                        }
                    }
                },
                HubCommand::Allocate(reply) => {
                    let permit = self.capacity.clone().try_acquire_owned();
                    let store = self.store.clone();
                    let tasks = self.tasks.clone();
                    let closing = self.closing;
                    self.tasks.spawn(async move {
                        let result = async {
                            ensure_or_reject!(!closing, "Draining");
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
                    let table = replay_table(*snapshot, false, false, session.user, &session.name);
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
                        let _ = reply.send(Err(rejection!(
                            "Server draining; the prepared table will recover"
                        )));
                        continue;
                    }
                    if !self.current(&session) {
                        let _ = reply.send(Err(rejection!("Session changed during preparation")));
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
                        self.info.clone(),
                    );
                    let id = actor.table.id;
                    let view = actor.view();
                    let initial = if !self.closing && self.current(&session) {
                        Some((session, warnings, reply))
                    } else {
                        let _ = reply.send(Err(rejection!(
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
                        self.info.clone(),
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
                            let _ = handle.sender.try_send(TableCommand::Client {
                                session,
                                command: Command::Reattend {
                                    spectate: spectator,
                                    shadow,
                                },
                                reply,
                            });
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
                        session.emit(&frame(
                            hanabi_protocol::server::SYNCED,
                            hanabi_protocol::Empty {},
                        ));
                        Ok(())
                    } else {
                        Err(rejection!("Session unavailable"))
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
                            hanabi_protocol::server::TABLE_GONE,
                            TableRequest {
                                table_id: TableId(effects.table),
                            },
                        ));
                    }
                    for (session, status, table) in effects.statuses {
                        if self.current(&session) {
                            if let Some(p) = self.sessions.get_mut(&session.user) {
                                p.status = status;
                                p.table = table;
                            }
                            if let Some(p) = self.sessions.get(&session.user) {
                                self.broadcast(&frame(
                                    hanabi_protocol::server::USER,
                                    Self::user(p),
                                ));
                            }
                        }
                    }
                    if changed
                        && let Some(entry) = self.tables.get(&effects.table)
                        && entry.view.visible
                    {
                        // The hub handles one message at a time, so serialize the table once for
                        // its players and once for everyone else rather than once per user.
                        let [other, joined] = [false, true].map(|joined| {
                            let mut data = entry.view.data.clone();
                            data.joined = joined;
                            frame(hanabi_protocol::server::TABLE, data)
                        });
                        for p in self.sessions.values() {
                            p.session
                                .emit(if entry.view.players.contains(&p.session.user) {
                                    &joined
                                } else {
                                    &other
                                });
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
                            hanabi_protocol::server::TABLE_GONE,
                            TableRequest {
                                table_id: TableId(id),
                            },
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

/// The table a command is for: its table ID, or for chat, its "table{id}" room.
pub(super) fn table_target(message: &ClientMessage) -> Option<u64> {
    use ClientMessage as M;
    let id = match message {
        M::Chat(r) => return r.room.strip_prefix("table")?.parse().ok(),
        M::ChatRead(r)
        | M::ChatTyping(r)
        | M::TableLeave(r)
        | M::TableReattend(r)
        | M::IdleReset(r) => r.table_id,
        M::TableUnattend(r)
        | M::TableTerminate(r)
        | M::TableVoteForTermination(r)
        | M::GetGameInfo1(r)
        | M::GetGameInfo2(r)
        | M::Loaded(r) => r.table_id,
        M::TableJoin(r) => r.table_id,
        M::TableSetLeader(r) => r.table_id,
        M::TableSetVariant(r) => r.table_id,
        M::TableStart(r) => r.table_id,
        M::TableRestart(r) => r.table_id,
        M::TableRestartDecline(r) => r.table_id,
        M::TableSuggest(r) => r.table_id,
        M::TableSpectate(r) => r.table_id,
        M::TableUpdate(r) => r.table_id,
        M::Action(r) => r.table_id,
        M::Pause(r) => r.table_id,
        M::Note(r) => r.table_id,
        M::Tag(r) | M::TagDelete(r) => r.table_id,
        M::TagsDeleteAll(r) => r.table_id,
        M::ReplayAction(r) => r.table_id(),
        M::LobbyLoad(_)
        | M::Sync(_)
        | M::ChatPM(_)
        | M::ChatPMHistoryGet(_)
        | M::ChatFriend(_)
        | M::ChatUnfriend(_)
        | M::ChatLink(_)
        | M::ChatUnlink(_)
        | M::ChatLinked(_)
        | M::ChatBlock(_)
        | M::ChatUnblock(_)
        | M::ChatBlocked(_)
        | M::Setting(_)
        | M::Inactive(_)
        | M::HistoryGet(_)
        | M::HistoryGetSeed(_)
        | M::TagSearch(_)
        | M::TableCreate(_)
        | M::ReplayCreate(_) => return None,
    };
    Some(id.0)
}
