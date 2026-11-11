use super::{
    Allocation, Blocks, Command, Effects, Entry, HubCommand, Presence, Reply, SeatReservation,
    Status, TableActor, TableCommand, TableHandle, TableView,
    setup::{Creation, prepare_table},
};
use crate::errors::{CommandError, CommandResult, Report};
use crate::{
    integrations::IntegrationSlot,
    lobby::{OnlineUser, Publication},
    model::TableSnapshot,
    operations::Operation,
    routing::{Route, route},
    server_info::ServerInfo,
    store::{Saved, Store},
    transport::{Frame, Session, frame},
};
use anyhow::{Context, Result};
use axum::http::StatusCode;
use futures_util::FutureExt;
use hanabi_protocol::PlayerIndex;
use hanabi_protocol::{
    ClientMessage, LobbySoundMessage, TableId, TableRef, User, UserId, UserList, UserRemoved,
};
use std::{
    collections::{BTreeSet, HashMap},
    panic::AssertUnwindSafe,
    sync::Arc,
    time::Duration,
};
use tokio::sync::{Semaphore, mpsc, oneshot};
use tokio_util::task::TaskTracker;
use tracing::Instrument;

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
    pub(super) sessions: HashMap<UserId, Presence>,
    pub(super) tables: HashMap<TableId, Entry>,
    pub(super) closing: bool,
    pub(super) store: Store,
    pub(super) tasks: TaskTracker,
    pub(super) capacity: Arc<Semaphore>,
    /// The users with a pending request to play at a table, and the ID of the reservation that
    /// holds each one's seat. The hub alone decides who plays where: from the tables' published
    /// views, and from these reservations for requests that no view shows yet.
    pub(super) reservations: HashMap<UserId, u64>,
    pub(super) next_reservation: u64,
    pub(super) info: Arc<ServerInfo>,
    /// Where the hub sends alerts, once the integrations start.
    pub(super) integrations: IntegrationSlot,
}
impl Hub {
    /// Starts the hub for tests, which do not alert.
    #[cfg(test)]
    pub async fn start(
        store: Store,
        tasks: TaskTracker,
        info: Arc<ServerInfo>,
        integrations: IntegrationSlot,
    ) -> Result<mpsc::Sender<HubCommand>> {
        Ok(Self::recover(store, tasks, info, integrations).await?.0)
    }
    /// Starts the hub and restores the saved tables. Returns the reports of the tables that could
    /// not be read, which it already logged, for the alerts once they start.
    pub async fn recover(
        store: Store,
        tasks: TaskTracker,
        info: Arc<ServerInfo>,
        integrations: IntegrationSlot,
    ) -> Result<(mpsc::Sender<HubCommand>, Vec<Report>)> {
        let recovered = store.recover().await?;
        let unreadable = recovered
            .unreadable
            .into_iter()
            .map(|(id, error)| {
                let report = Report::known(
                    "Recovering a table",
                    hanabi_protocol::NoticeCode::TableUnreadable,
                    format!(
                        "Table {id} could not be read from its checkpoint, so it was not restored. Its checkpoint stays in the database, and the next start reads it again."
                    ),
                    StatusCode::INTERNAL_SERVER_ERROR,
                );
                tracing::error!(
                    diagnostic_id = %report.diagnostic_id,
                    "Table {id} checkpoint is unreadable: {error:#}"
                );
                report.log();
                report
            })
            .collect();
        let restored = recovered.tables;
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
            reservations: HashMap::new(),
            next_reservation: 0,
            info,
            integrations,
        };
        for (table, saved) in restored {
            let permit = hub
                .capacity
                .clone()
                .try_acquire_owned()
                .context("Recovery table capacity exhausted")?;
            let actor = TableActor::new(
                table,
                saved,
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
                    attendees: BTreeSet::new(),
                    published: true,
                },
            );
        }
        tasks.spawn(hub.run());
        Ok((sender, unreadable))
    }
    fn spawn(
        &self,
        actor: TableActor,
        initial: Option<(Arc<Session>, Vec<String>, Reply)>,
    ) -> TableHandle {
        let (sender, receiver) = mpsc::channel(TABLE_QUEUE);
        let handle = TableHandle {
            sender,
            cleanup: actor.cleanup.clone(),
        };
        self.supervise(actor.table.id, actor.run(receiver, initial));
        handle
    }
    /// Runs a table's task. If the task panics, the hub removes its table, which would otherwise
    /// stay in the lobby with its players seated and never answer.
    pub(super) fn supervise(&self, id: TableId, task: impl Future<Output = ()> + Send + 'static) {
        let hub = self.sender.clone();
        let task = task.instrument(tracing::info_span!("table", id = %id));
        self.tasks.spawn(async move {
            if AssertUnwindSafe(task).catch_unwind().await.is_err() {
                let _ = hub.send(HubCommand::TableFailed(id)).await;
            }
        });
    }
    /// Removes a table whose task panicked, sends its users back to the lobby, and reports the
    /// failure. The table's last checkpoint stays saved, so the table comes back after a restart.
    fn table_failed(&mut self, id: TableId) {
        let report = Report::known(
            "Running a table",
            hanabi_protocol::NoticeCode::TableFailed,
            format!(
                "Table {id} stopped after an internal error. Its last saved state comes back when the server restarts."
            ),
            StatusCode::INTERNAL_SERVER_ERROR,
        );
        report.log();
        if let Some(integrations) = self.integrations.get() {
            integrations.report(&report);
        }
        if self.tables.remove(&id).is_some_and(|e| e.view.visible) {
            self.broadcast(&frame(
                hanabi_protocol::server::TABLE_REMOVED,
                TableRef { table_id: id },
            ));
        }
        let boot = frame(
            hanabi_protocol::server::TABLE_BOOTED,
            TableRef { table_id: id },
        );
        let warning = frame(hanabi_protocol::server::WARNING, report.notice());
        let users = self
            .sessions
            .values_mut()
            .filter(|p| p.table == Some(id))
            .map(|p| {
                p.status = Status::Lobby;
                p.table = None;
                p.session.emit(&boot);
                p.session.emit(&warning);
                p.session.user
            })
            .collect::<Vec<_>>();
        for user in users {
            self.broadcast_user(user);
        }
    }
    /// Whether `s` is the user's newest connection and still open. A session closes when the
    /// server loses ownership of the live tables, so this also checks ownership.
    fn current(&self, s: &Session) -> bool {
        s.active()
            && self
                .sessions
                .get(&s.user)
                .is_some_and(|p| p.session.generation == s.generation)
    }
    fn user(p: &Presence) -> User {
        User {
            user_id: p.session.user,
            username: p.session.name.clone().into(),
            activity: activity(p.status, p.table),
            h_group_conventions: p.h_group,
            h_group_level: p.h_group_level,
            bot: p.session.bot,
            inactive: p.inactive,
        }
    }
    /// Sends a frame to every connection. `emit` skips connections that have closed.
    fn broadcast(&self, message: &Frame) {
        for p in self.sessions.values() {
            p.session.emit(message);
        }
    }
    fn table_for(v: &TableView, user: UserId) -> hanabi_protocol::Table {
        let mut data = v.data.clone();
        data.joined = v.players.contains(&user);
        data
    }
    fn playing_elsewhere(&self, user: UserId, except: Option<TableId>) -> bool {
        self.tables.iter().any(|(id, entry)| {
            Some(*id) != except && !entry.view.replay && entry.view.players.contains(&user)
        })
    }
    /// Reserves the seats of `users` for a request to play at a table. Fails if any of them plays
    /// at a table other than `except` or has another such request pending.
    fn reserve(
        &mut self,
        users: Vec<UserId>,
        except: Option<TableId>,
        playing_elsewhere: &str,
    ) -> CommandResult<SeatReservation> {
        ensure_or_reject!(
            users
                .iter()
                .all(|user| !self.reservations.contains_key(user)),
            "Another playing-table request is already pending."
        );
        ensure_or_reject!(
            users
                .iter()
                .all(|user| !self.playing_elsewhere(*user, except)),
            "{playing_elsewhere}"
        );
        self.next_reservation += 1;
        let id = self.next_reservation;
        for user in &users {
            self.reservations.insert(*user, id);
        }
        Ok(SeatReservation {
            id,
            users,
            hub: Some(self.sender.clone()),
        })
    }
    /// Ends a seat reservation once its request has finished. A table that the request changed
    /// publishes its view before it answers, so the view already shows the seats.
    fn end_reservation(&mut self, reservation: SeatReservation) {
        let (id, users) = reservation.take();
        self.end_reservation_of(id, &users);
    }
    fn end_reservation_of(&mut self, id: u64, users: &[UserId]) {
        for user in users {
            if self.reservations.get(user) == Some(&id) {
                self.reservations.remove(user);
            }
        }
    }
    /// Wakes the tables where a user plays or attends, so that they notice the user's connection
    /// came or went.
    fn wake_tables_of(&self, user: UserId) {
        for entry in self.tables.values() {
            if entry.attendees.contains(&user) || entry.view.players.contains(&user) {
                entry.handle.cleanup.notify_one();
            }
        }
    }
    /// A connected user's blocks.
    fn blocks(&self, user: UserId) -> Blocks {
        self.sessions
            .get(&user)
            .map(|p| p.blocks.clone())
            .unwrap_or_default()
    }
    fn route(&mut self, s: Arc<Session>, id: TableId, command: Command, reply: Reply) {
        if self.closing || !self.current(&s) {
            let _ = reply.send(Err(rejection!("Stale session or draining server")));
            return;
        }
        let Some(sender) = self.tables.get(&id).map(|e| e.handle.sender.clone()) else {
            // The table ended, perhaps after someone shared a link to it. The client forgets it
            // without a warning.
            s.emit(&frame(
                hanabi_protocol::server::TABLE_REMOVED,
                TableRef { table_id: id },
            ));
            let _ = reply.send(Err(CommandError::Rejected {
                message: "Unknown table".into(),
                silent: true,
            }));
            return;
        };
        let joining = matches!(&command, Command::Client(message) if matches!(**message, ClientMessage::TableJoin(_)));
        let blocks = self.blocks(s.user);
        let reservation = if joining && !s.bot {
            match self.reserve(
                vec![s.user],
                Some(id),
                "You cannot join more than one table at a time. Terminate your other game before joining a new one.",
            ) {
                Ok(reservation) => Some(reservation),
                Err(error) => {
                    let _ = reply.send(Err(error));
                    return;
                }
            }
        } else {
            None
        };
        // A join answers through the hub, which first ends its seat reservation.
        let (table_reply, joined) = match reservation {
            Some(reservation) => {
                let (completed, received) = oneshot::channel();
                (completed, Some((received, reservation, reply)))
            }
            None => (reply, None),
        };
        let queued = sender.try_send(TableCommand::Client {
            session: s,
            blocks,
            command,
            reply: table_reply,
        });
        if let Err(error) = queued {
            let refusal = match &error {
                mpsc::error::TrySendError::Full(_) => {
                    rejection!("This table is busy. Please try again in a moment.")
                }
                mpsc::error::TrySendError::Closed(_) => rejection!("Table closed"),
            };
            match joined {
                Some((_, _, reply)) => {
                    let _ = reply.send(Err(refusal));
                }
                None => {
                    if let TableCommand::Client { reply, .. } = error.into_inner() {
                        let _ = reply.send(Err(refusal));
                    }
                }
            }
            return;
        }
        let Some((received, reservation, reply)) = joined else {
            return;
        };
        let hub = self.sender.clone();
        self.tasks.spawn(async move {
            let result = received
                .await
                .unwrap_or_else(|_| Err(rejection!("Table closed")));
            if let Err(error) = hub
                .send(HubCommand::JoinFinished {
                    result,
                    reply,
                    reservation,
                })
                .await
                && let HubCommand::JoinFinished { reply, .. } = error.0
            {
                let _ = reply.send(Err(internal!("Coordinator stopped")));
            }
        });
    }
    /// A shared replay of the same database game that a link to it should join.
    fn existing_replay(&self, r: &hanabi_protocol::ReplayCreateRequest) -> Option<TableId> {
        let hanabi_protocol::ReplayCreateRequest {
            source: hanabi_protocol::ReplaySource::Saved { game_id: game },
            visibility:
                hanabi_protocol::ReplayVisibility::Shared {
                    join_existing: true,
                    ..
                },
            ..
        } = *r
        else {
            return None;
        };
        self.tables
            .iter()
            .filter(|(_, e)| e.view.replay && e.view.visible && e.view.replay_game == Some(game))
            .map(|(id, _)| *id)
            .min()
    }
    fn create(&mut self, s: Arc<Session>, creation: Creation, reply: Reply) {
        if self.closing || !self.current(&s) {
            let message = if self.closing {
                "The server is shutting down."
            } else {
                "Your session is no longer current."
            };
            let _ = reply.send(Err(rejection!("{message}")));
            return;
        }
        // Take capacity first: a refused request then never holds a seat reservation, which would
        // otherwise end through the hub's own queue when dropped.
        let Ok(permit) = self.capacity.clone().try_acquire_owned() else {
            let _ = reply.send(Err(rejection!(
                "The server has reached its limit of {MAX_TABLES} open tables. Please try again later."
            )));
            return;
        };
        let playing = matches!(creation, Creation::Table(_)) && !s.bot;
        let reservation = if playing {
            match self.reserve(
                vec![s.user],
                None,
                "You cannot join more than one table at a time. Terminate your other game before creating a new one.",
            ) {
                Ok(reservation) => Some(reservation),
                Err(error) => {
                    let _ = reply.send(Err(error));
                    return;
                }
            }
        } else {
            None
        };
        let store = self.store.clone();
        let hub = self.sender.clone();
        let tasks = self.tasks.clone();
        self.tasks.spawn(async move {
            let prepared = prepare_table(&store, &s, creation).await;
            match prepared {
                Ok((table, saved, warnings)) => {
                    let id = table.id;
                    let mut allocation =
                        Allocation::new(id, permit, store.clone(), tasks, saved.revision);
                    allocation.reservation = reservation;
                    let installed = HubCommand::Install {
                        table: Box::new(table),
                        saved,
                        allocation,
                        session: s,
                        warnings,
                        reply,
                    };
                    send_install(&hub, installed).await;
                }
                Err(error) => {
                    // End the reservation before answering, so a retry does not find it.
                    drop(reservation);
                    let _ = reply.send(Err(error));
                }
            }
        });
    }
    fn apply_effects(
        &mut self,
        session: &Arc<Session>,
        effects: Vec<Publication>,
    ) -> CommandResult<()> {
        self.store.check_state()?;
        ensure_or_reject!(self.current(session), "Stale session");
        for effect in effects {
            match effect {
                Publication::Broadcast(message) => self.broadcast(message.frame()),
                Publication::ToSelf(message) => session.emit(message.frame()),
                Publication::ToUser {
                    id,
                    generation,
                    message,
                } => {
                    if let Some(p) = self
                        .sessions
                        .get(&id)
                        .filter(|p| p.session.generation == generation && p.session.active())
                    {
                        p.session.emit(message.frame());
                    }
                }
                Publication::HGroup(value) => {
                    self.update_user(session.user, |p| p.h_group = value);
                }
                Publication::HGroupLevel(value) => {
                    self.update_user(session.user, |p| p.h_group_level = value);
                }
                Publication::Inactive(value) => {
                    self.update_user(session.user, |p| p.inactive = value);
                }
                Publication::BlocksChanged {
                    user_id,
                    target_id,
                    blocked,
                } => {
                    for (user, other) in [(user_id, target_id), (target_id, user_id)] {
                        if let Some(p) = self.sessions.get_mut(&user) {
                            let blocks = Arc::make_mut(&mut p.blocks);
                            if blocked {
                                blocks.insert(other);
                            } else {
                                blocks.remove(&other);
                            }
                        }
                    }
                }
            }
        }
        Ok(())
    }
    /// Changes a connected user and tells everyone.
    fn update_user(&mut self, user: UserId, change: impl FnOnce(&mut Presence)) {
        if let Some(p) = self.sessions.get_mut(&user) {
            change(p);
        }
        self.broadcast_user(user);
    }
    /// Tells everyone about a change to a connected user.
    fn broadcast_user(&self, user: UserId) {
        if let Some(p) = self.sessions.get(&user) {
            self.broadcast(&frame(hanabi_protocol::server::USER, Self::user(p)));
        }
    }
    fn disconnect(&mut self, users: &[UserId]) {
        for user in users {
            if let Some(p) = self.sessions.remove(user) {
                p.session.cancel.cancel();
                self.broadcast(&frame(
                    hanabi_protocol::server::USER_REMOVED,
                    UserRemoved { user_id: *user },
                ));
            }
        }
        for user in users {
            self.wake_tables_of(*user);
        }
    }
    fn operations(&mut self, command: Operation, reply: oneshot::Sender<Result<()>>) {
        if let Err(error) = self.store.check_state() {
            let _ = reply.send(Err(error));
            return;
        }
        match command {
            Operation::Mute { user_id } => self.disconnect(&[user_id]),
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
            }
        }
        let _ = reply.send(Ok(()));
    }
    /// Tells every connection that the server is going down, then closes it. Answers once the
    /// connections have taken their closing messages, or after `RESTART_CLOSE_TIMEOUT`.
    fn drained(
        &self,
        reconnect: bool,
        message: Option<String>,
        reply: oneshot::Sender<Result<()>>,
    ) {
        if let Err(error) = self.store.check_state() {
            let _ = reply.send(Err(error));
            return;
        }
        let messages = [
            frame(
                hanabi_protocol::server::LOBBY_SOUND,
                LobbySoundMessage {
                    sound: hanabi_protocol::LobbySound::Shutdown,
                },
            ),
            if reconnect {
                frame(
                    hanabi_protocol::server::SERVER_RESTART,
                    hanabi_protocol::ServerRestart { message },
                )
            } else {
                frame(
                    hanabi_protocol::server::ERROR,
                    hanabi_protocol::Notice::new(
                        "The server is going down for maintenance. Your accepted game progress has been saved.<br />Please reconnect after the server restarts.",
                    ),
                )
            },
        ];
        let receipts = self
            .sessions
            .values()
            .filter_map(|p| {
                p.session
                    .close_after(&messages, crate::transport::SERVICE_RESTART_CLOSE_CODE)
            })
            .collect::<Vec<_>>();
        self.tasks.spawn(async move {
            // Connections that do not take their closing messages in time are closed anyway.
            let _ = tokio::time::timeout(
                RESTART_CLOSE_TIMEOUT,
                futures_util::future::join_all(receipts),
            )
            .await;
            let _ = reply.send(Ok(()));
        });
    }
    pub(super) async fn run(mut self) {
        while let Some(command) = self.receiver.recv().await {
            match command {
                HubCommand::Register {
                    session,
                    blocks,
                    welcome,
                    initial,
                    reply,
                } => {
                    let result = self.register(&session, blocks, welcome, initial);
                    let _ = reply.send(result);
                }
                HubCommand::Logout(session) => self.logout(&session),
                HubCommand::Directory { session, reply } => {
                    let _ = reply.send(self.directory(&session));
                }
                HubCommand::LobbyEffects {
                    session,
                    effects,
                    reply,
                } => {
                    let _ = reply.send(self.apply_effects(&session, effects));
                }
                HubCommand::Broadcast { messages, reply } => {
                    let result = self.store.check_state().map_err(CommandError::from);
                    if result.is_ok() {
                        for message in messages {
                            self.broadcast(message.frame());
                        }
                    }
                    let _ = reply.send(result);
                }
                HubCommand::JoinFinished {
                    result,
                    reply,
                    reservation,
                } => {
                    self.end_reservation(reservation);
                    let _ = reply.send(result);
                }
                HubCommand::ReserveSeats { users, from, reply } => {
                    let result = if self.closing {
                        Err(rejection!("The server is shutting down."))
                    } else {
                        self.reserve(
                            users,
                            Some(from),
                            "An original player is already playing at another table.",
                        )
                    };
                    let _ = reply.send(result);
                }
                HubCommand::EndReservation { id, users } => self.end_reservation_of(id, &users),
                HubCommand::Operations { command, reply } => self.operations(command, reply),
                HubCommand::Drained {
                    reconnect,
                    message,
                    reply,
                } => self.drained(reconnect, message, reply),
                HubCommand::Inspect(reply) => {
                    let _ = reply.send(self.store.check_state());
                }
                HubCommand::Client {
                    session,
                    message,
                    reply,
                } => self.client(session, message, reply),
                HubCommand::Allocate(reply) => self.allocate(reply),
                HubCommand::Install {
                    table,
                    saved,
                    allocation,
                    session,
                    warnings,
                    reply,
                } => {
                    if self.closing {
                        let _ = reply.send(Err(rejection!(
                            "Server draining; the prepared table will recover"
                        )));
                    } else if !self.current(&session) {
                        let _ = reply.send(Err(rejection!("Session changed during preparation")));
                    } else if self.tables.contains_key(&table.id) || allocation.id != table.id {
                        let _ = reply.send(Err(internal!("Duplicate table installation")));
                    } else {
                        // The creator has seen the chat that preparing the table wrote.
                        let chat_read = HashMap::from([(table.owner, table.chat.len())]);
                        self.install(
                            *table,
                            saved,
                            allocation,
                            chat_read,
                            Some((session, warnings, reply)),
                        );
                    }
                }
                HubCommand::Spawn {
                    table,
                    saved,
                    allocation,
                    attendees,
                    chat_read,
                } => self.spawn_split(*table, saved, allocation, attendees, chat_read),
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
                HubCommand::Effects(effects) => self.publish_table(effects),
                HubCommand::TableFailed(id) => self.table_failed(id),
                HubCommand::Retire(id) => {
                    if self.tables.remove(&id).is_some_and(|e| e.view.visible) {
                        self.broadcast(&frame(
                            hanabi_protocol::server::TABLE_REMOVED,
                            TableRef { table_id: id },
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
    /// Admits a new connection, replacing the user's earlier one, and sends it the lobby.
    fn register(
        &mut self,
        session: &Arc<Session>,
        blocks: BTreeSet<UserId>,
        mut welcome: hanabi_protocol::Welcome,
        initial: Vec<Frame>,
    ) -> CommandResult<()> {
        if self.closing
            || !session.active()
            || self
                .sessions
                .get(&session.user)
                .is_some_and(|p| p.session.generation > session.generation)
        {
            session.cancel.cancel();
            reject!("Stale or draining session");
        }
        if let Some(old) = self.sessions.remove(&session.user) {
            old.session.supersede();
        }
        self.wake_tables_of(session.user);
        welcome.playing_at_tables = self
            .tables
            .iter()
            .filter(|(_, e)| !e.view.replay && e.view.players.contains(&session.user))
            .map(|(id, _)| *id)
            .collect();
        welcome.spectating_at_tables =
            self.tables
                .iter()
                .filter_map(|(id, e)| {
                    e.view.reconnects.get(&session.user).map(|shadow| {
                        hanabi_protocol::SpectatedTable {
                            table_id: *id,
                            shadowing_player_index: *shadow,
                        }
                    })
                })
                .collect();
        welcome
            .spectating_at_tables
            .sort_by_key(|table| std::cmp::Reverse(table.table_id));
        self.sessions.insert(
            session.user,
            Presence::new(session.clone(), &welcome.settings, Arc::new(blocks)),
        );
        session.emit(&frame(hanabi_protocol::server::WELCOME, welcome));
        session.emit(&frame(
            hanabi_protocol::server::USER_LIST,
            UserList {
                users: self.sessions.values().map(Self::user).collect(),
            },
        ));
        session.emit(&frame(
            hanabi_protocol::server::TABLE_LIST,
            hanabi_protocol::TableList {
                tables: self
                    .tables
                    .values()
                    .filter(|e| e.view.visible)
                    .map(|e| Self::table_for(&e.view, session.user))
                    .collect(),
            },
        ));
        for message in initial {
            session.emit(&message);
        }
        self.broadcast_user(session.user);
        Ok(())
    }
    /// Ends a connection. Tells everyone the user left, unless a newer connection replaced it.
    fn logout(&mut self, session: &Session) {
        session.cancel.cancel();
        if self
            .sessions
            .get(&session.user)
            .is_some_and(|p| p.session.generation == session.generation)
        {
            self.sessions.remove(&session.user);
            self.broadcast(&frame(
                hanabi_protocol::server::USER_REMOVED,
                UserRemoved {
                    user_id: session.user,
                },
            ));
        }
        self.wake_tables_of(session.user);
    }
    /// Lists the online users, for a session that is current.
    fn directory(&self, session: &Session) -> CommandResult<Vec<OnlineUser>> {
        ensure_or_reject!(self.current(session), "Stale session");
        Ok(self
            .sessions
            .values()
            .filter(|p| p.session.active())
            .map(|p| OnlineUser {
                identity: p.session.identity.clone(),
                generation: p.session.generation,
            })
            .collect())
    }
    /// Runs a client command that the hub handles: a table or replay creation, or a command that
    /// it routes to a table.
    fn client(&mut self, session: Arc<Session>, message: ClientMessage, reply: Reply) {
        match message {
            ClientMessage::TableCreate(r) => self.create(session, Creation::Table(r), reply),
            ClientMessage::ReplayCreate(r) => {
                if let Some(id) = self.existing_replay(&r) {
                    let spectate =
                        ClientMessage::TableSpectate(hanabi_protocol::TableSpectateRequest {
                            table_id: id,
                            shadowing_player_index: r.shadowing_player_index,
                        });
                    self.route(session, id, Command::Client(Box::new(spectate)), reply);
                } else {
                    self.create(session, Creation::Replay(r), reply);
                }
            }
            message => match route(&message) {
                Route::Table(table) | Route::TableChat(table) => {
                    self.route(session, table, Command::Client(Box::new(message)), reply);
                }
                other => {
                    let _ = reply.send(Err(internal!(
                        "Command {} runs at {other:?}, not at a table",
                        message.name()
                    )));
                }
            },
        }
    }
    /// Reserves capacity and an ID for a new table, such as one that a split or restart creates.
    fn allocate(&self, reply: oneshot::Sender<CommandResult<Allocation>>) {
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
    /// Starts the actor of a saved table and lists the table. `chat_read` holds how much of the
    /// table's chat each user has read. Returns the table's handle.
    fn install(
        &mut self,
        table: TableSnapshot,
        saved: Saved,
        mut allocation: Allocation,
        chat_read: HashMap<UserId, usize>,
        initial: Option<(Arc<Session>, Vec<String>, Reply)>,
    ) -> TableHandle {
        if let Some(reservation) = allocation.reservation.take() {
            self.end_reservation(reservation);
        }
        let mut actor = TableActor::new(
            table,
            saved,
            self.store.clone(),
            self.sender.clone(),
            allocation.into_permit(),
            self.info.clone(),
        );
        actor.chat_read = chat_read;
        self.add_table(actor, initial)
    }
    /// Starts an actor and lists its table. Returns the table's handle.
    fn add_table(
        &mut self,
        actor: TableActor,
        initial: Option<(Arc<Session>, Vec<String>, Reply)>,
    ) -> TableHandle {
        let id = actor.table.id;
        let view = actor.view();
        let handle = self.spawn(actor, initial);
        self.tables.insert(
            id,
            Entry {
                handle: handle.clone(),
                view,
                attendees: BTreeSet::new(),
                published: false,
            },
        );
        handle
    }
    /// Starts the table that a split or restart created, and moves its attendees to it.
    fn spawn_split(
        &mut self,
        table: TableSnapshot,
        saved: Saved,
        allocation: Allocation,
        attendees: Vec<(Arc<Session>, bool, Option<PlayerIndex>)>,
        chat_read: HashMap<UserId, usize>,
    ) {
        if self.closing {
            return;
        }
        let handle = self.install(table, saved, allocation, chat_read, None);
        for (session, spectate, shadow) in attendees {
            if self.current(&session) {
                let (reply, _) = oneshot::channel();
                let _ = handle.sender.try_send(TableCommand::Client {
                    blocks: self.blocks(session.user),
                    session,
                    command: Command::Reattend { spectate, shadow },
                    reply,
                });
            }
        }
    }
    /// Records a table's new view, updates its users' statuses, and sends its messages.
    fn publish_table(&mut self, effects: Effects) {
        let Some(entry) = self.tables.get_mut(&effects.table) else {
            return;
        };
        let hidden = entry.view.visible && !effects.view.visible;
        let changed = !entry.published || entry.view != effects.view;
        entry.view = effects.view;
        entry.attendees = effects.attendees;
        entry.published = true;
        if hidden {
            self.broadcast(&frame(
                hanabi_protocol::server::TABLE_REMOVED,
                TableRef {
                    table_id: effects.table,
                },
            ));
        }
        for (session, status, table) in effects.statuses {
            if self.current(&session) {
                self.update_user(session.user, |p| {
                    p.status = status;
                    p.table = table;
                });
            }
        }
        if changed
            && let Some(entry) = self.tables.get(&effects.table)
            && entry.view.visible
        {
            // The hub handles one message at a time, so serialize the table once for its players
            // and once for everyone else rather than once per user.
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
}

/// Sends a prepared table to the hub to install. If the hub has stopped, answers the request; the
/// saved table recovers on the next start.
async fn send_install(hub: &mpsc::Sender<HubCommand>, install: HubCommand) {
    if let Err(error) = hub.send(install).await
        && let HubCommand::Install { reply, .. } = error.0
    {
        let _ = reply.send(Err(internal!("Coordinator stopped; table is recoverable")));
    }
}

/// A user's activity as the wire carries it. A solo replay is private, so its table is not named.
fn activity(status: Status, table: Option<TableId>) -> hanabi_protocol::Activity {
    use hanabi_protocol::Activity;
    match (status, table) {
        (Status::Pregame, Some(table_id)) => Activity::Pregame { table_id },
        (Status::Playing, Some(table_id)) => Activity::Playing { table_id },
        (Status::Spectating, Some(table_id)) => Activity::Spectating { table_id },
        (Status::SharedReplay, Some(table_id)) => Activity::SharedReplay { table_id },
        (Status::Replay, _) => Activity::Replay {},
        (Status::Lobby, _) | (_, None) => Activity::Lobby {},
    }
}
