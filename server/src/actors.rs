use crate::{
    game::{Game, Options},
    lobby::{Effect, OnlineUser},
    model::{
        CLOCK_UNITS_PER_SECOND, ExtraOptions, FORMAT, IDLE_TIMEOUT_MS, IDLE_WARNING_MS,
        MAX_NOTE_LENGTH, MAX_TABLE_NAME_LENGTH, MAX_TAG_LENGTH, NoteOwner, PendingTag, Phase,
        Player, ReplayState, Snapshot, TableChat, TableSnapshot, Tag, engine_options, small,
        tag_too_long, wire_options,
    },
    operations::Operation,
    server_info::ServerInfo,
    store::Store,
    transport::{Outgoing, Session, frame, stored_frame},
};
use anyhow::{Context, Result, bail, ensure};
use chrono::{Duration as ChronoDuration, Utc};
use hanabi_engine::{CompletionTiming, EndCondition, GameSetup, Interpretation, Recipient};
use hanabi_protocol::{
    Chat, ChatSource, ChatTyping, ClientMessage, ErrorNotice, IdleWarning, MAX_PLAYERS,
    MIN_PLAYERS, ReplayAction, SECONDS_PER_MINUTE, SoundLobby, Status, TableId, TableRequest,
    TableStarted, User, UserId, UserLeft, UserList, Warning,
};
use serde::Serialize;
use serde_json::{Value, json};
use std::{
    cmp::Ordering,
    collections::{BTreeMap, HashMap, HashSet},
    fmt::Write as _,
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
const REPLAY_RECONNECT_GRACE: Duration = Duration::from_secs(60);
/// Appended to the name of a table that a split creates.
const SPLIT_SUFFIX: &str = " (split)";
/// The commands the hub queues before senders wait.
const HUB_QUEUE: usize = 512;
/// The most tables open at once.
const MAX_TABLES: usize = 256;
/// The commands a table queues before senders wait.
const TABLE_QUEUE: usize = 64;
/// How long a graceful restart waits for connections to receive their closing messages.
const RESTART_CLOSE_TIMEOUT: Duration = Duration::from_secs(1);
/// How often a table checks its timers.
const TABLE_TICK: Duration = Duration::from_millis(250);
/// How long a typing indicator lasts without another keystroke.
const TYPING_TIMEOUT: Duration = Duration::from_secs(2);
/// The longest table password, in bytes.
const MAX_TABLE_PASSWORD_BYTES: usize = 1024;
/// The longest countdown `/startin` can set, in minutes.
const MAX_START_IN_MINUTES: f64 = 10.0;
/// The time added to each clock of a timed game when a graceful restart drains its table, so that
/// players do not lose time to the restart.
const MAINTENANCE_CLOCK_ALLOWANCE_SECONDS: i64 = 20;
/// The bits of an `f64` mantissa, including its implicit leading bit.
const FLOAT_MANTISSA_BITS: i32 = f64::MANTISSA_DIGITS.cast_signed();
/// The power of two of the smallest positive subnormal `f64`.
const FLOAT_MIN_EXPONENT: i32 = f64::MIN_EXP - FLOAT_MANTISSA_BITS;
/// The prefix of a hexadecimal float.
const HEX_PREFIX: &str = "0x";
const HEX_RADIX: u32 = 16;
/// The binary digits that one hexadecimal digit holds.
const HEX_DIGIT_BITS: u32 = HEX_RADIX.trailing_zeros();

/// Whether an untimed game, or a timed game within the clock limits.
fn valid_timed_options(options: &Options) -> bool {
    !options.timed
        || (options.time_base > 0.0
            && options.time_base <= f64::from(hanabi_protocol::MAX_TIME_BASE_SECONDS)
            && (1..=hanabi_protocol::MAX_TIME_PER_TURN_SECONDS).contains(&options.time_per_turn))
}

use hanabi_protocol::SafeInteger;

fn int(value: usize) -> i64 {
    i64::try_from(value).unwrap_or(i64::MAX)
}

/// The wire form of an engine event, which serializes identically.
fn wire_event(event: &hanabi_engine::EngineEvent) -> hanabi_protocol::GameEvent {
    use hanabi_engine::EngineEvent as E;
    use hanabi_protocol::GameEvent as G;
    match event {
        E::Draw {
            player_index,
            order,
            suit_index,
            rank,
        } => G::Draw {
            player_index: int(*player_index),
            order: int(*order),
            suit_index: (*suit_index).into(),
            rank: (*rank).into(),
        },
        E::Play {
            player_index,
            order,
            suit_index,
            rank,
        } => G::Play {
            player_index: int(*player_index),
            order: int(*order),
            suit_index: (*suit_index).into(),
            rank: (*rank).into(),
        },
        E::CardIdentity {
            player_index,
            order,
            suit_index,
            rank,
        } => G::CardIdentity {
            player_index: int(*player_index),
            order: int(*order),
            suit_index: (*suit_index).into(),
            rank: (*rank).into(),
        },
        E::Discard {
            player_index,
            order,
            suit_index,
            rank,
            failed,
        } => G::Discard {
            player_index: int(*player_index),
            order: int(*order),
            suit_index: (*suit_index).into(),
            rank: (*rank).into(),
            failed: *failed,
        },
        E::Clue {
            clue,
            giver,
            target,
            list,
            turn,
        } => G::Clue {
            clue: hanabi_protocol::Clue {
                // The wire marks a clue that the recipient may not see with -1.
                clue_type: clue.clue_type.map_or(-1, i32::from),
                value: clue.value,
            },
            giver: int(*giver),
            target: int(*target),
            list: list.iter().map(|&order| SafeInteger(int(order))).collect(),
            turn: (*turn).into(),
        },
        E::Strike { num, turn, order } => G::Strike {
            num: (*num).into(),
            turn: (*turn).into(),
            order: int(*order),
        },
        E::Status {
            clues,
            score,
            max_score,
        } => G::Status {
            clues: (*clues).into(),
            score: (*score).into(),
            max_score: (*max_score).into(),
        },
        E::Turn {
            num,
            current_player_index,
        } => G::Turn {
            num: (*num).into(),
            current_player_index: (*current_player_index).into(),
        },
        E::GameOver {
            end_condition,
            player_index,
            votes,
        } => G::GameOver {
            end_condition: *end_condition,
            player_index: (*player_index).into(),
            votes: votes
                .as_ref()
                .map(|votes| votes.iter().map(|&vote| SafeInteger(int(vote))).collect()),
        },
        E::PlayerTimes {
            player_times,
            duration,
        } => G::PlayerTimes {
            player_times: player_times.iter().copied().map(SafeInteger).collect(),
            duration: *duration,
        },
    }
}

pub(crate) fn game_action(
    table: u64,
    event: &hanabi_engine::EngineEvent,
) -> hanabi_protocol::GameAction {
    hanabi_protocol::GameAction {
        table_id: TableId(table),
        action: wire_event(event),
    }
}

pub(crate) fn game_action_list(
    table: u64,
    list: &[hanabi_engine::EngineEvent],
) -> hanabi_protocol::GameActionList {
    hanabi_protocol::GameActionList {
        table_id: TableId(table),
        list: list.iter().map(wire_event).collect(),
    }
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
            users
                .lock()
                .unwrap_or_else(std::sync::PoisonError::into_inner)
                .insert(user),
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
            .unwrap_or_else(std::sync::PoisonError::into_inner)
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
    /// The database game shown by a replay.
    replay_game: Option<i32>,
    visible: bool,
    data: hanabi_protocol::Table,
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
    status: Status,
    table: Option<u64>,
}
pub struct Effects {
    pub table: u64,
    pub view: TableView,
    pub statuses: Vec<(Arc<Session>, Status, Option<u64>)>,
    pub messages: Vec<(Arc<Session>, String)>,
}
pub enum HubCommand {
    Register {
        session: Arc<Session>,
        welcome: hanabi_protocol::Welcome,
        initial: Vec<String>,
        reply: Reply,
    },
    Logout(Arc<Session>),
    Allocate(oneshot::Sender<Result<Allocation>>),
    Replay {
        session: Arc<Session>,
        snapshot: Box<Snapshot>,
        allocation: Allocation,
        reply: Reply,
    },
    Client {
        session: Arc<Session>,
        message: ClientMessage,
        reply: Reply,
    },
    /// Fails for a stale session. The online users are listed only when `users` is set.
    Directory {
        session: Arc<Session>,
        users: bool,
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
    /// A client command, decoded once into its payload type.
    Client(Box<ClientMessage>),
    /// Restores a reconnecting user's attendance and view.
    Reattend {
        spectate: bool,
        shadow: Option<usize>,
    },
}
pub enum TableCommand {
    Client {
        session: Arc<Session>,
        command: Command,
        reply: Reply,
    },
    Drain(oneshot::Sender<Result<()>>),
}
/// Decodes a command the way the WebSocket parser does, for tests that build commands by name.
#[cfg(test)]
pub(crate) fn client_message(name: &str, data: &Value) -> Result<ClientMessage> {
    ClientMessage::decode(name, data)?.with_context(|| format!("Unregistered command {name}"))
}

#[cfg(test)]
pub(crate) fn test_table() -> hanabi_protocol::Table {
    hanabi_protocol::Table {
        id: TableId(1),
        joined: false,
        max_players: hanabi_protocol::DEFAULT_MAX_PLAYERS,
        name: "test".into(),
        num_players: 1,
        options: hanabi_protocol::GameOptions::default(),
        owner_id: UserId(1),
        password_protected: false,
        players: vec!["test".into()],
        progress: 0,
        running: false,
        shared_replay: false,
        spectators: vec![],
        time_base: 0.0,
        time_per_turn: 0,
        timed: false,
        variant: hanabi_protocol::DEFAULT_VARIANT_NAME.into(),
    }
}
#[cfg(test)]
pub(crate) fn test_welcome() -> hanabi_protocol::Welcome {
    hanabi_protocol::Welcome {
        user_id: UserId(1),
        username: "test".into(),
        total_games: None,
        muted: false,
        first_time_user: false,
        settings: hanabi_protocol::Settings::default(),
        connection_mode: hanabi_protocol::ConnectionMode::Initial,
        friends: vec![],
        playing_at_tables: vec![],
        discon_spectating_table: None,
        discon_shadowing_seat: None,
    }
}
pub struct Hub {
    receiver: mpsc::Receiver<HubCommand>,
    sender: mpsc::Sender<HubCommand>,
    sessions: HashMap<i32, Presence>,
    tables: HashMap<u64, Entry>,
    closing: bool,
    store: Store,
    tasks: TaskTracker,
    capacity: Arc<Semaphore>,
    playing_claims: Arc<Mutex<HashSet<i32>>>,
    info: Arc<ServerInfo>,
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
            hyphenated: p.session.hyphenated(),
            inactive: p.session.inactive(),
        }
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
            let _ = reply.send(Err(anyhow::anyhow!("Stale session or draining server")));
            return;
        }
        let joining = matches!(&command, Command::Client(message) if matches!(**message, ClientMessage::TableJoin(_)));
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
            let _ = reply.send(Err(anyhow::anyhow!(message)));
            return;
        }
        let playing = matches!(creation, Creation::Table(_)) && !s.name.starts_with("Bot-");
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
            ensure!(self.current(s), "Stale session");
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
                Effect::Hyphenated(value) => {
                    let s = session.context("Missing session")?;
                    s.set_hyphenated(value);
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
                json!({"users":self.sessions.values().map(Self::user).collect::<Vec<_>>(),"tables":self.tables.values().map(|e|e.view.inspection.clone()).collect::<Vec<_>>(),"activeGames":self.tables.values().filter(|e|e.view.inspection["running"]==true&&e.view.inspection["replay"]==false&&e.view.inspection["frozen"]==false).count()}),
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
                                .unwrap_or(-1),
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
                    let reconnect =
                        welcome.connection_mode == hanabi_protocol::ConnectionMode::Reconnect;
                    session.emit(&frame(hanabi_protocol::server::WELCOME, welcome));
                    if !reconnect {
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
                    }
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
                        Err(anyhow::anyhow!("Stale session"))
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
                        Err(anyhow::anyhow!("The server is shutting down."))
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
                        self.info.clone(),
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

fn validate_table_name(name: &str) -> Result<()> {
    ensure!(
        name.chars().all(|c| c.is_alphanumeric()
            || unicode_normalization::char::is_combining_mark(c)
            || " _!#$'()+,-.:;=?@".contains(c)),
        "Invalid table name"
    );
    Ok(())
}
fn server_chat(id: u64, message: &str) -> Chat {
    Chat {
        who: Some("Hanab Live".into()),
        room: Some(if id == 0 {
            "lobby".into()
        } else {
            format!("table{id}")
        }),
        ..Chat::new(message, ChatSource::Server, chat_time())
    }
}
fn authored_chat(id: u64, name: &str, message: &str) -> Chat {
    Chat {
        who: Some(name.into()),
        room: Some(format!("table{id}")),
        ..Chat::new(
            crate::accounts::escape_html(message),
            ChatSource::User,
            chat_time(),
        )
    }
}
fn chat_time() -> String {
    crate::model::timestamp(Utc::now())
}

fn remove_pregame_players(table: &mut TableSnapshot, removed: &HashSet<i32>) -> Vec<Chat> {
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

/// The most table chat messages one player can send per `TABLE_CHAT_WINDOW`.
const TABLE_CHAT_LIMIT: usize = 30;
const TABLE_CHAT_WINDOW: Duration = Duration::from_mins(1);
/// Players can fill only part of a table's chat, so server notices and the game still fit in its
/// checkpoint.
const MAX_PLAYER_CHAT_MESSAGES: usize = crate::model::MAX_TABLE_CHAT / 2;
const MAX_PLAYER_CHAT_BYTES: usize = crate::state::MAX_CHECKPOINT_BYTES / 2;

/// Whether players can add to a table's chat. One message or command can go past the budget.
fn player_chat_has_room(chat: &[TableChat]) -> Result<bool> {
    Ok(chat.len() < MAX_PLAYER_CHAT_MESSAGES
        && serde_json::to_vec(chat)?.len() < MAX_PLAYER_CHAT_BYTES)
}

fn membership_notice(table: &mut TableSnapshot, text: &str) -> Option<Chat> {
    if table.chat.len() >= crate::model::MAX_TABLE_CHAT {
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
        message: json!(message),
    });
    Some(message)
}

/// Converts a float that validation has already bounded to an integer, dropping any fraction.
#[expect(
    clippy::cast_possible_truncation,
    reason = "callers pass floats that validation bounds"
)]
fn truncate(value: f64) -> i64 {
    value as i64
}
#[expect(
    clippy::cast_precision_loss,
    reason = "the parsed mantissa is rounded to an `f64`'s precision before it becomes a float"
)]
fn parse_start_minutes(argument: &str) -> Option<f64> {
    let value = format!("0{argument}");
    if regex!(r"(?i)^\d(?:_?\d)*(?:\.(?:\d(?:_?\d)*)?)?(?:e[+-]?\d(?:_?\d)*)?$").is_match(&value) {
        let value = value.replace('_', "").parse::<f64>().ok()?;
        return value.is_finite().then_some(value);
    }
    if !regex!(r"(?i)^0x_?(?:[0-9a-f](?:_?[0-9a-f])*(?:\.(?:[0-9a-f](?:_?[0-9a-f])*)?)?|\.[0-9a-f](?:_?[0-9a-f])*)p[+-]?\d(?:_?\d)*$").is_match(&value) {
        return None;
    }
    let cleaned = value.replace('_', "").to_ascii_lowercase();
    let (mantissa, power) = cleaned[HEX_PREFIX.len()..].split_once('p')?;
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
    let exponent = power.saturating_sub(
        i64::try_from(fraction)
            .unwrap_or(i64::MAX)
            .saturating_mul(i64::from(HEX_DIGIT_BITS)),
    );
    let mut bits = Vec::new();
    for digit in mantissa.chars().filter(|c| *c != '.') {
        let value = digit.to_digit(HEX_RADIX)?;
        for bit in (0..HEX_DIGIT_BITS).rev() {
            bits.push((value >> bit) & 1);
        }
    }
    let Some(first) = bits.iter().position(|b| *b != 0) else {
        return Some(0.0);
    };
    let bits = &bits[first..];
    let size = i64::try_from(bits.len()).ok()?;
    let min_exponent = i64::from(FLOAT_MIN_EXPONENT);
    if exponent.saturating_add(size) < min_exponent {
        return Some(0.0);
    }
    if exponent.saturating_add(size) > i64::from(f64::MAX_EXP) {
        return None;
    }
    let shift = 0
        .max(size - i64::from(FLOAT_MANTISSA_BITS))
        .max(min_exponent - exponent);
    let kept = usize::try_from((size - shift).max(0)).ok()?;
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
/// A private message to a table's owner, with a button that applies the suggested options.
fn options_suggestion(
    id: u64,
    owner: &str,
    options: &Options,
    name: &str,
    max_players: usize,
) -> Chat {
    Chat {
        recipient: Some(owner.into()),
        suggested_options: Some(hanabi_protocol::GameOptions {
            table_name: Some(name.into()),
            max_players: Some(small(max_players)),
            ..wire_options(options)
        }),
        ..server_chat(
            id,
            "<span class=\"cp\"><button class=\"new-options\">click to apply the suggestion</button></span>",
        )
    }
}
#[expect(
    clippy::float_cmp,
    reason = "any change to the time setting is reported"
)]
fn option_changes(
    table: &TableSnapshot,
    options: &Options,
    name: &str,
    max_players: usize,
) -> String {
    let current = &table.options;
    let mut changes = String::new();
    let mut add = |label: &str, value: &str| {
        write!(
            changes,
            "<span class=\"cp\">{label}: <b>{}</b></span>",
            crate::accounts::escape_html(value)
        )
        .expect("writing to a string cannot fail");
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
    let Command::Client(message) = command else {
        return false;
    };
    let ClientMessage::Chat(request) = &**message else {
        return false;
    };
    crate::accounts::normalize_chat(&request.msg).is_ok_and(|text| {
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
    query: std::pin::Pin<Box<dyn Future<Output = Result<Option<String>>> + Send>>,
}
fn replay_table(
    mut snapshot: Snapshot,
    shared: bool,
    spoiler_free: bool,
    owner: i32,
    owner_name: &str,
) -> TableSnapshot {
    let id = snapshot.table_id;
    let options = snapshot.game.options.clone();
    for (index, player) in snapshot.players.iter_mut().enumerate() {
        player.id = -1 - hanabi_engine::int(index);
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
                hypothetical: false,
                hypothetical_actions: vec![],
                show_drawn_cards: false,
                spoiler_free,
            },
        },
        chat: vec![],
        chat_archived: 0,
        shadows: BTreeMap::new(),
        pending_spawn: None,
        retire_after_spawn: false,
        pending_tag: None,
    }
}
/// A pregame change to a table: only its variant, or every option.
enum TableChange {
    Variant(String),
    Options(Box<hanabi_protocol::TableUpdateRequest>),
}

/// A request to create a table or a replay, decoded from its wire contract.
enum Creation {
    Table(hanabi_protocol::TableCreateRequest),
    Replay(hanabi_protocol::ReplayCreateRequest),
}
/// The table a command is for: its table ID, or for chat, its "table{id}" room.
fn table_target(message: &ClientMessage) -> Option<u64> {
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
        | M::ChatPlayerInfo(_)
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

async fn prepare_table(
    store: &Store,
    session: &Session,
    creation: Creation,
) -> Result<(TableSnapshot, i64, Vec<String>)> {
    store.check_state()?;
    ensure!(session.active(), "Stale session");
    let id = store.allocate_table().await?;
    let result = async {
        let r = match creation {
            Creation::Table(r) => r,
            Creation::Replay(r) => {
                ensure!(
                    r.password.is_empty(),
                    "You cannot create a replay with a password."
                );
                let shared = r.visibility == hanabi_protocol::ReplayVisibility::Shared;
                ensure!(
                    shared || !r.spoiler_free,
                    "Only a shared replay can be a spoiler-free review."
                );
                let mut warnings = vec![];
                let mut custom_seed = None;
                let snapshot = if r.source == hanabi_protocol::ReplaySource::Json {
                    let imported =
                        replay_helpers::parse(r.game_json.as_ref().context("Missing game JSON")?)?;
                    warnings.clone_from(&imported.warnings);
                    custom_seed = Some(imported.custom_seed.clone());
                    replay_helpers::snapshot(imported, id, session.user)
                } else {
                    store
                        .historical(
                            r.database_id.context("Missing databaseID")?,
                            id,
                            session.user,
                        )
                        .await?
                };
                let mut table = replay_table(
                    snapshot,
                    shared,
                    r.spoiler_free,
                    session.user,
                    &session.name,
                );
                if let Some(seed) = custom_seed {
                    table.extra.custom_seed = seed;
                }
                let revision = store.save(&table, 0).await?;
                return Ok((table, revision, warnings));
            }
        };
        let mut name = crate::accounts::truncate_to_max_bytes(r.name.trim(), MAX_TABLE_NAME_LENGTH)
            .trim_end()
            .to_owned();
        if name.is_empty() {
            name = format!("{}'s table", session.name);
        }
        validate_table_name(&name)?;
        let mut options = engine_options(&r.options);
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
        ensure!(valid_timed_options(&options), "Invalid timed options");
        let mut extra = ExtraOptions::default();
        if name.starts_with('!') {
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
                    usize::try_from(historical.game.turn).is_ok_and(|limit| turn < limit),
                    "Replay turn exceeds game"
                );
                options = historical.game.options.clone();
                extra.custom_seed = Some(historical.seed);
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
                            metadata: if hanabi_engine::Character::from_name(&p.character)
                                .is_some_and(hanabi_engine::Character::has_assigned_metadata)
                            {
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
                    .map(|a| ReplayAction {
                        kind: a.action_type,
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
        }
        let variant = hanabi_engine::get_variant(&options.variant_name)?;
        options.variant_id = Some(variant.id);
        let player = store
            .player_for_variant(session.user, session.name.clone(), variant.id)
            .await?;
        let max_players = usize::try_from(r.max_players)
            .ok()
            .filter(|n| hanabi_protocol::is_player_count(*n))
            .unwrap_or(usize::from(hanabi_protocol::DEFAULT_MAX_PLAYERS))
            .max(extra.custom_num_players.unwrap_or(MIN_PLAYERS));
        let password = r.password;
        let password_hash = if password.is_empty() {
            None
        } else {
            ensure!(
                password.len() <= MAX_TABLE_PASSWORD_BYTES,
                "Passwords cannot be longer than {MAX_TABLE_PASSWORD_BYTES} bytes"
            );
            Some(crate::accounts::hash_password(&session.ip, password).await?)
        };
        ensure!(session.active(), "Creator disconnected during preparation");
        let table = TableSnapshot {
            format: FORMAT.into(),
            id,
            name,
            owner: session.user,
            visible: !r.hide_pregame,
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
    replay_absent_until: Option<Instant>,
    cleanup: Arc<Notify>,
    store: Store,
    hub: mpsc::Sender<HubCommand>,
    anchor: Instant,
    /// Whether the table was warned that the game is about to end for inactivity. Kept in memory:
    /// after a restart, the warning is sent again.
    idle_warned: bool,
    /// Who the table was told tried to join it while it was full. Kept in memory: after a restart,
    /// the table can be told again.
    full_join_notices: HashSet<i32>,
    /// Each player's recent table chat. Kept in memory: a restart forgives it.
    chat_limit: crate::accounts::Counter<i32>,
    _permit: OwnedSemaphorePermit,
    playing_claims: Arc<Mutex<HashSet<i32>>>,
    info: Arc<ServerInfo>,
}
impl TableActor {
    fn new(
        table: TableSnapshot,
        revision: i64,
        store: Store,
        hub: mpsc::Sender<HubCommand>,
        permit: OwnedSemaphorePermit,
        info: Arc<ServerInfo>,
    ) -> Self {
        Self {
            table,
            revision,
            frozen: false,
            retired: false,
            attendees: HashMap::new(),
            chat_read: HashMap::new(),
            pregame_absent_until: HashMap::new(),
            replay_absent_until: None,
            cleanup: Arc::new(Notify::new()),
            store,
            hub,
            anchor: Instant::now(),
            idle_warned: false,
            full_join_notices: HashSet::new(),
            chat_limit: crate::accounts::Counter::new(TABLE_CHAT_LIMIT, TABLE_CHAT_WINDOW),
            _permit: permit,
            playing_claims: Arc::new(Mutex::new(HashSet::new())),
            info,
        }
    }
    fn view(&self) -> TableView {
        let replay = matches!(self.table.phase, Phase::Replay { .. });
        let running = !matches!(self.table.phase, Phase::Pregame { .. });
        let max_progress = i32::from(hanabi_protocol::MAX_PROGRESS);
        let progress = if let Some(s) = self.table.game() {
            if let Phase::Replay { replay, .. } = &self.table.phase {
                (replay.segment * max_progress / s.game.turn.max(1)).clamp(0, max_progress)
            } else {
                s.game.score * max_progress
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
            replay_game: match &self.table.phase {
                Phase::Replay { snapshot, .. } if snapshot.game_id > 0 => Some(snapshot.game_id),
                _ => None,
            },
            visible: self.table.visible,
            reconnects: self
                .table
                .shadows
                .iter()
                .filter(|(id, _)| replay || self.table.players().iter().all(|p| p.id != **id))
                .map(|(id, shadow)| (*id, *shadow))
                .collect(),
            inspection: json!({"running":running,"replay":replay,"frozen":self.frozen}),
            data: hanabi_protocol::Table {
                id: TableId(self.table.id),
                joined: false,
                max_players: small(self.table.max_players),
                name: self.table.name.clone(),
                num_players: small(self.table.players().len()),
                options: wire_options(&self.table.options),
                owner_id: UserId(self.table.owner),
                password_protected: self.table.password_hash.is_some(),
                players: self
                    .table
                    .players()
                    .iter()
                    .map(|p| p.name.clone())
                    .collect(),
                progress: u8::try_from(progress.clamp(0, max_progress)).unwrap_or(0),
                running,
                shared_replay: replay && self.table.visible,
                spectators,
                time_base: self.table.options.time_base,
                time_per_turn: self.table.options.time_per_turn,
                timed: self.table.options.timed,
                variant: self.table.options.variant_name.clone(),
            },
        }
    }
    fn spectators(&self) -> Vec<hanabi_protocol::Spectator> {
        self.attendees
            .values()
            .filter(|a| a.spectator && a.session.active())
            .map(|a| hanabi_protocol::Spectator {
                name: a.session.name.clone(),
                shadowing_player_index: a
                    .shadow
                    .and_then(|seat| i8::try_from(seat).ok())
                    .unwrap_or(-1),
                shadowing_player_username: a
                    .shadow
                    .and_then(|seat| self.table.players().get(seat))
                    .map(|p| p.name.clone()),
            })
            .collect()
    }
    fn spectator_messages(&self, e: &mut Effects) {
        self.add_all(
            e,
            hanabi_protocol::server::SPECTATORS,
            hanabi_protocol::Spectators {
                table_id: TableId(self.table.id),
                spectators: self.spectators(),
            },
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
    fn add_all<T: Serialize>(
        &self,
        e: &mut Effects,
        message: hanabi_protocol::ServerMessage<T>,
        data: T,
    ) {
        let message = frame(message, data);
        for a in self.audience() {
            e.messages.push((a.session.clone(), message.clone()));
        }
    }
    fn add_outgoing(&self, e: &mut Effects, message: &Outgoing) {
        let message = message.frame();
        for a in self.audience() {
            e.messages.push((a.session.clone(), message.clone()));
        }
    }
    fn add_chat(&self, e: &mut Effects, chat: &Chat) {
        self.add_all(e, hanabi_protocol::server::CHAT, chat.clone());
    }
    fn typing_messages(&self, e: &mut Effects, author: i32, name: &str, typing: bool) {
        let message = frame(
            hanabi_protocol::server::CHAT_TYPING,
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
        // Statistics are stored in the checkpoint as JSON; a malformed value shows as no games
        // rather than withholding the pregame.
        let stats = self
            .table
            .players()
            .iter()
            .map(|p| {
                serde_json::from_value::<hanabi_protocol::PregameStats>(p.stats.clone())
                    .unwrap_or_else(|error| {
                        eprintln!(
                            "Invalid pregame statistics at table {}: {error}",
                            self.table.id
                        );
                        hanabi_protocol::PregameStats::default()
                    })
            })
            .collect::<Vec<_>>();
        for a in self.audience() {
            let players = self
                .table
                .players()
                .iter()
                .zip(&stats)
                .enumerate()
                .map(|(index, (p, stats))| hanabi_protocol::PregamePlayer {
                    index: small(index),
                    name: p.name.clone(),
                    you: p.id == a.session.user,
                    present: self
                        .attendees
                        .get(&p.id)
                        .is_some_and(|a| a.session.active() && !a.spectator),
                    stats: stats.clone(),
                })
                .collect();
            let pregame = hanabi_protocol::Pregame {
                table_id: TableId(self.table.id),
                name: self.table.name.clone(),
                owner: UserId(self.table.owner),
                players,
                options: wire_options(&self.table.options),
                password_protected: self.table.password_hash.is_some(),
                max_players: small(self.table.max_players),
            };
            e.messages.push((
                a.session.clone(),
                frame(hanabi_protocol::server::GAME, pregame),
            ));
        }
    }
    fn chat_history(&self, e: &mut Effects, session: &Arc<Session>) -> Result<()> {
        let read = self.chat_read.get(&session.user).copied().unwrap_or(0);
        e.messages.push((
            session.clone(),
            stored_frame(
                hanabi_protocol::server::CHAT_LIST,
                &json!({
                    "list":self.table.chat.iter().map(TableChat::wire_message).collect::<Result<Vec<_>>>()?,
                    "unread":self.table.chat.len().saturating_sub(read)
                }),
            )?,
        ));
        Ok(())
    }
    fn candidate(&self) -> TableSnapshot {
        let mut next = self.table.clone();
        let live = matches!(next.phase, Phase::Live { .. });
        let delta = i64::try_from(self.anchor.elapsed().as_millis())
            .unwrap_or(i64::MAX)
            .min(hanabi_protocol::MAX_SAFE_INTEGER);
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
    /// Keeps a change that is not worth a durable write, such as an idle-timer reset, in memory.
    /// The next checkpoint saves it, including the one written when the server drains; a crash
    /// before then only loses this change.
    fn apply_without_checkpoint(&mut self, next: TableSnapshot) -> Result<()> {
        self.store.check_state()?;
        ensure!(!self.frozen, "Table is frozen until recovery");
        self.table = next;
        self.anchor = Instant::now();
        Ok(())
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
                    .map(hanabi_engine::int);
            }
        }
        if let Some(s) = next.game_mut()
            && s.game.end_condition != EndCondition::InProgress
            && s.finished.is_none()
        {
            s.finished = Some(Utc::now());
        }
        // `save` repeats these checks, but a failure inside it freezes the table. Checking here
        // first rejects an invalid or oversized change while the table keeps running.
        next.validate()?;
        self.store.prepare_chat(&mut next).await?;
        ensure!(
            serde_json::to_vec(&next)?.len() <= crate::state::MAX_CHECKPOINT_BYTES,
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
        self.replay_absent_until = None;
        let mut e = self.effects();
        if matches!(self.table.phase, Phase::Pregame { .. }) {
            e.statuses
                .push((s.clone(), Status::PreGame, Some(self.table.id)));
            self.pregame_messages(&mut e);
            e.messages.push((
                s.clone(),
                frame(
                    hanabi_protocol::server::JOINED,
                    TableRequest {
                        table_id: TableId(self.table.id),
                    },
                ),
            ));
            self.chat_history(&mut e, &s)?;
        } else {
            e.statuses.push((
                s.clone(),
                if self.table.visible {
                    Status::SharedReplay
                } else {
                    Status::Replay
                },
                Some(self.table.id),
            ));
            e.messages.push((
                s.clone(),
                frame(
                    hanabi_protocol::server::TABLE_START,
                    TableStarted {
                        table_id: TableId(self.table.id),
                        replay: true,
                    },
                ),
            ));
        }
        for warning in warnings {
            e.messages.push((
                s.clone(),
                frame(hanabi_protocol::server::WARNING, Warning { warning }),
            ));
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
        let mut tick = tokio::time::interval(TABLE_TICK);
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
                                    for clock in &mut s.clocks{*clock+=MAINTENANCE_CLOCK_ALLOWANCE_SECONDS*i64::from(CLOCK_UNITS_PER_SECOND);}s.maintenance_applied=true;
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
                    }
                },
                ()=self.cleanup.notified()=>{if let Err(e)=self.cleanup(Instant::now()).await{eprintln!("Table cleanup: {e}");}},
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
            hanabi_protocol::is_player_count(participants.len()),
            "This command requires {MIN_PLAYERS} to {MAX_PLAYERS} participants"
        );
        let count = participants.len();
        let ids = participants.iter().map(|(id, _)| *id).collect::<Vec<_>>();
        let store = self.store.clone();
        let query = Box::pin(async move {
            let rows = sqlx::query!(
                r#"SELECT variant_id,CASE $2::smallint WHEN 2 THEN best_score2 WHEN 3 THEN best_score3
                   WHEN 4 THEN best_score4 WHEN 5 THEN best_score5 ELSE best_score6 END AS "score!"
                   FROM user_stats WHERE user_id=ANY($1)"#,
                &ids,
                i16::try_from(count)?,
            )
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
            message: json!(message),
        });
        self.persist(next).await?;
        let mut effects = self.effects();
        self.add_chat(&mut effects, &message);
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
            let proposal = options_suggestion(
                self.table.id,
                &owner.session.name,
                &options,
                &self.table.name,
                self.table.max_players,
            );
            effects.messages.push((
                owner.session.clone(),
                frame(hanabi_protocol::server::CHAT, proposal),
            ));
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
        if matches!(self.table.phase, Phase::Replay { .. }) && self.attendees.is_empty() {
            let deadline = self
                .replay_absent_until
                .get_or_insert(now + REPLAY_RECONNECT_GRACE);
            if now >= *deadline {
                return self.retire().await;
            }
        } else {
            self.replay_absent_until = None;
        }
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
            self.add_all(&mut e, hanabi_protocol::server::CONNECTED, self.connected());
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
            self.add_chat(&mut effects, &message);
        }
        self.publish(effects).await
    }
    fn connected(&self) -> hanabi_protocol::Connected {
        let replay = matches!(self.table.phase, Phase::Replay { .. });
        hanabi_protocol::Connected {
            table_id: TableId(self.table.id),
            list: self
                .table
                .players()
                .iter()
                .map(|p| {
                    replay
                        || self
                            .attendees
                            .get(&p.id)
                            .is_some_and(|a| a.loaded && !a.spectator && a.session.active())
                })
                .collect(),
        }
    }
    fn card_identities(&self, s: &Snapshot) -> hanabi_protocol::CardIdentities {
        hanabi_protocol::CardIdentities {
            table_id: TableId(self.table.id),
            card_identities: s
                .game
                .identities()
                .iter()
                .map(|card| hanabi_protocol::CardIdentity {
                    suit_index: int(card.suit_index),
                    rank: i64::from(card.rank),
                })
                .collect(),
        }
    }
    fn clock(&self) -> hanabi_protocol::Clock {
        let next = self.candidate();
        let s = next.game().expect("game clock");
        let live = matches!(next.phase, Phase::Live { .. })
            && s.game.end_condition == EndCondition::InProgress;
        hanabi_protocol::Clock {
            table_id: TableId(self.table.id),
            times: s.clocks.clone(),
            active_player_index: if live {
                int(s.game.active_player_index)
            } else {
                -1
            },
            time_taken: if !live || s.game.paused {
                0
            } else {
                s.turn_elapsed
            },
        }
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
        let message = match command {
            Command::Client(message) => *message,
            Command::Reattend { spectate, shadow } => {
                return self
                    .reattend(session, spectate, Some(shadow.map_or(-1, int)))
                    .await;
            }
        };
        let name = message.name();
        match message {
            ClientMessage::TableJoin(r) => self.join(session, r.password).await,
            ClientMessage::TableReattend(_) => self.reattend(session, false, None).await,
            ClientMessage::TableSpectate(r) => {
                self.reattend(session, true, Some(r.shadowing_player_index))
                    .await
            }
            ClientMessage::TableUnattend(_) => self.leave(session, false).await,
            ClientMessage::TableLeave(_) => self.leave(session, true).await,
            ClientMessage::GetGameInfo1(_) => self.info(session, 1).await,
            ClientMessage::GetGameInfo2(_) => self.info(session, 2).await,
            ClientMessage::TableStart(r) => {
                let players = self.table.players();
                // A start based on a stale view of the table does nothing.
                if r.intended_variant
                    .as_deref()
                    .is_some_and(|v| !v.is_empty() && v != self.table.options.variant_name)
                    || r.intended_players.as_ref().is_some_and(|names| {
                        names.len() != players.len()
                            || players.iter().any(|p| !names.contains(&p.name))
                    })
                {
                    return Ok(());
                }
                self.start(session).await
            }
            ClientMessage::Loaded(_) => {
                ensure!(self.attending(&session), "Reattend before loading");
                let mut next = self.candidate();
                let mut starts_clock = false;
                if let Phase::Live { snapshot: s } = &mut next.phase
                    && s.game.end_condition == EndCondition::InProgress
                    && s.players[s.game.active_player_index].id == session.user
                {
                    starts_clock = !s.timer_started || !s.game.started_timer;
                    s.timer_started = true;
                    s.game.started_timer = true;
                }
                // Loading usually changes nothing durable; only starting the clock needs saving.
                if starts_clock {
                    self.persist(next).await?;
                } else {
                    self.apply_without_checkpoint(next)?;
                }
                if let Some(a) = self.attendees.get_mut(&session.user) {
                    a.loaded = true;
                }
                let mut e = self.effects();
                self.add_all(&mut e, hanabi_protocol::server::CONNECTED, self.connected());
                if matches!(self.table.phase, Phase::Live { .. }) {
                    self.add_all(&mut e, hanabi_protocol::server::CLOCK, self.clock());
                }
                self.publish(e).await
            }
            ClientMessage::Action(r) => {
                let action = ReplayAction {
                    kind: r.kind.into(),
                    target: r.target,
                    value: r.value,
                };
                self.action(session, action).await
            }
            ClientMessage::TableTerminate(_)
                if matches!(self.table.phase, Phase::Pregame { .. }) =>
            {
                ensure!(
                    self.attending(&session) && session.user == self.table.owner,
                    "Only owner can terminate"
                );
                self.retire().await
            }
            ClientMessage::TableTerminate(_) => self.terminate(session, false).await,
            ClientMessage::TableVoteForTermination(_) => self.terminate(session, true).await,
            ClientMessage::Pause(r) => self.pause(session, r.setting).await,
            ClientMessage::IdleReset(_) => self.idle_reset(session).await,
            ClientMessage::Note(r) => self.note(session, r.order, &r.note).await,
            ClientMessage::Tag(r) | ClientMessage::TagDelete(r) => {
                self.tag(session, &r.msg, &r.room, name).await
            }
            ClientMessage::TagsDeleteAll(r) => self.tag(session, "", &r.room, name).await,
            ClientMessage::Chat(r) => self.chat(session, &r.msg).await,
            ClientMessage::ChatRead(_) => self.chat_presence(session, false).await,
            ClientMessage::ChatTyping(_) => self.chat_presence(session, true).await,
            ClientMessage::TableSetLeader(r) => self.leader(session, &r.name).await,
            ClientMessage::TableSuggest(r) => self.suggest(session, r.segment).await,
            ClientMessage::TableSetVariant(r) => {
                self.update(session, TableChange::Variant(r.options.variant_name))
                    .await
            }
            ClientMessage::TableUpdate(r) => {
                self.update(session, TableChange::Options(Box::new(r)))
                    .await
            }
            ClientMessage::TableRestart(r) => self.restart(session, r.hide_pregame).await,
            ClientMessage::ReplayAction(r) => self.replay_action(session, r).await,
            // Handled before reaching a table.
            ClientMessage::LobbyLoad(_)
            | ClientMessage::Sync(_)
            | ClientMessage::ChatPM(_)
            | ClientMessage::ChatPMHistoryGet(_)
            | ClientMessage::ChatFriend(_)
            | ClientMessage::ChatUnfriend(_)
            | ClientMessage::ChatLink(_)
            | ClientMessage::ChatUnlink(_)
            | ClientMessage::ChatPlayerInfo(_)
            | ClientMessage::ChatLinked(_)
            | ClientMessage::ChatBlock(_)
            | ClientMessage::ChatUnblock(_)
            | ClientMessage::ChatBlocked(_)
            | ClientMessage::Setting(_)
            | ClientMessage::Inactive(_)
            | ClientMessage::HistoryGet(_)
            | ClientMessage::HistoryGetSeed(_)
            | ClientMessage::TagSearch(_)
            | ClientMessage::TableCreate(_)
            | ClientMessage::ReplayCreate(_) => bail!("Unsupported table command: {name}"),
        }
    }
    async fn update(&mut self, session: Arc<Session>, change: TableChange) -> Result<()> {
        let (variant, request) = match change {
            TableChange::Variant(name) => (Some(name), None),
            TableChange::Options(request) => (None, Some(*request)),
        };
        let variant_only = variant.is_some();
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
            engine_options(&request.as_ref().context("Missing options")?.options)
        };
        if let Some(variant) = &variant {
            options.variant_name.clone_from(variant);
        }
        options.starting_player = 0;
        if options.speedrun || !options.timed {
            options.timed = false;
            options.time_base = 0.0;
            options.time_per_turn = 0;
        }
        ensure!(valid_timed_options(&options), "Invalid timed options");
        if options.one_extra_card && options.one_less_card {
            options.one_extra_card = false;
            options.one_less_card = false;
        }
        let mut name = if variant_only {
            self.table.name.clone()
        } else {
            crate::accounts::truncate_to_max_bytes(
                request.as_ref().map_or("", |r| r.name.as_str()),
                MAX_TABLE_NAME_LENGTH,
            )
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
            request
                .as_ref()
                .and_then(|r| usize::try_from(r.max_players).ok())
                .filter(|n| hanabi_protocol::is_player_count(*n))
                .unwrap_or(usize::from(hanabi_protocol::DEFAULT_MAX_PLAYERS))
        };
        let mut extra = if variant_only {
            self.table.extra.clone()
        } else {
            ExtraOptions::default()
        };
        if !variant_only && session.user == self.table.owner && name.starts_with('!') {
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
                        usize::try_from(historical.game.turn).is_ok_and(|limit| turn < limit),
                        "Replay turn exceeds game"
                    );
                    options = historical.game.options.clone();
                    extra.custom_seed = Some(historical.seed);
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
                                metadata: if hanabi_engine::Character::from_name(&p.character)
                                    .is_some_and(hanabi_engine::Character::has_assigned_metadata)
                                {
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
                        .map(|a| ReplayAction {
                            kind: a.action_type,
                            target: a.target,
                            value: a.value,
                        })
                        .collect();
                }
                _ => bail!("Unknown special game prefix"),
            }
        }
        let variant = hanabi_engine::get_variant(&options.variant_name)?;
        options.variant_id = Some(variant.id);
        max_players = max_players.max(extra.custom_num_players.unwrap_or(MIN_PLAYERS));
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
                message: json!(message),
            });
            self.persist(next).await?;
            let mut e = self.effects();
            self.add_chat(&mut e, &message);
            if let Some(owner) = self.attendees.get(&self.table.owner) {
                let suggestion = options_suggestion(
                    self.table.id,
                    &owner.session.name,
                    &options,
                    &name,
                    max_players,
                );
                e.messages.push((
                    owner.session.clone(),
                    frame(hanabi_protocol::server::CHAT, suggestion),
                ));
            }
            return self.publish(e).await;
        }
        let mut next = self.candidate();
        next.name = name;
        next.options = options;
        next.max_players = max_players;
        next.extra = extra;
        if !variant_only {
            next.visible = !request.as_ref().is_some_and(|r| r.hide_pregame);
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
            message: json!(message),
        });
        self.persist(next).await?;
        let mut e = self.effects();
        for p in removed {
            if let Some(a) = self.attendees.remove(&p.id) {
                e.statuses.push((a.session.clone(), Status::Lobby, None));
                e.messages.push((
                    a.session,
                    frame(
                        hanabi_protocol::server::BOOT,
                        TableRequest {
                            table_id: TableId(self.table.id),
                        },
                    ),
                ));
            }
        }
        self.pregame_messages(&mut e);
        self.add_chat(&mut e, &message);
        self.publish(e).await
    }
    /// Rejects a user who has blocked, or was blocked by, a player at this table or its owner.
    fn ensure_not_blocked(&self, session: &Session, message: &str) -> Result<()> {
        let others = self
            .table
            .players()
            .iter()
            .map(|p| p.id)
            .chain([self.table.owner]);
        ensure!(!session.blocks_any(others), "{message}");
        Ok(())
    }
    async fn join(&mut self, session: Arc<Session>, password: String) -> Result<()> {
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
            !players.iter().any(|p| p.id == session.user),
            "You have already joined this table."
        );
        let full = players.len() >= self.table.max_players;
        self.ensure_not_blocked(&session, "You cannot join this table.")?;
        if full {
            return self.join_full(&session).await;
        }
        if let Some(hash) = &self.table.password_hash {
            let hash = hash.clone();
            let valid = crate::accounts::verify_password(&session.ip, password, hash).await?;
            if !valid {
                eprintln!(
                    "Incorrect password for table {} by account {} from IP: {}",
                    self.table.id, session.user, session.ip
                );
                bail!("Incorrect table password");
            }
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
        next.shadows.remove(&session.user);
        let message = membership_notice(
            &mut next,
            &format!(
                "{} joined the game.",
                crate::accounts::escape_html(&session.name)
            ),
        );
        self.persist(next).await?;
        self.initialize(session.clone(), vec![]).await?;
        let mut e = self.effects();
        if let Some(message) = message {
            for attendee in self.audience().filter(|a| a.session.user != session.user) {
                e.messages.push((
                    attendee.session.clone(),
                    frame(hanabi_protocol::server::CHAT, message.clone()),
                ));
            }
        }
        self.publish(e).await
    }
    /// Tells a full table, once per person, that someone else wants to play, so that the players
    /// can consider splitting into two tables.
    async fn join_full(&mut self, session: &Arc<Session>) -> Result<()> {
        if self.table.password_hash.is_some() || !self.full_join_notices.insert(session.user) {
            bail!("This table is full.");
        }
        let mut next = self.candidate();
        let message = membership_notice(
            &mut next,
            &format!(
                "{} tried to join, but the table is full.",
                crate::accounts::escape_html(&session.name)
            ),
        );
        self.persist(next).await?;
        let mut e = self.effects();
        if let Some(message) = message {
            for attendee in self.audience() {
                e.messages.push((
                    attendee.session.clone(),
                    frame(hanabi_protocol::server::CHAT, message.clone()),
                ));
            }
        }
        self.publish(e).await?;
        bail!("This table is full. The players were told that you want to join.");
    }
    async fn reattend(
        &mut self,
        session: Arc<Session>,
        spectating: bool,
        requested_shadow: Option<i64>,
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
        if seat.is_none() {
            self.ensure_not_blocked(
                &session,
                if replay {
                    "You cannot join this replay."
                } else {
                    "You cannot spectate this table."
                },
            )?;
        }
        let shadow = if spectating {
            requested_shadow
                .and_then(|v| usize::try_from(v).ok())
                .filter(|v| *v < self.table.players().len())
        } else if replay {
            self.table
                .shadows
                .get(&session.user)
                .copied()
                .flatten()
                .and_then(|v| usize::try_from(v).ok())
        } else {
            None
        };
        let mut next = self.candidate();
        next.shadows
            .insert(session.user, shadow.map(hanabi_engine::int));
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
        self.replay_absent_until = None;
        let mut e = self.effects();
        e.statuses.push((
            session.clone(),
            if replay {
                if self.table.visible {
                    Status::SharedReplay
                } else {
                    Status::Replay
                }
            } else if spectating {
                Status::Spectating
            } else if pregame {
                Status::PreGame
            } else {
                Status::Playing
            },
            Some(self.table.id),
        ));
        if pregame {
            self.pregame_messages(&mut e);
            e.messages.push((
                session.clone(),
                frame(
                    hanabi_protocol::server::JOINED,
                    TableRequest {
                        table_id: TableId(self.table.id),
                    },
                ),
            ));
            self.chat_history(&mut e, &session)?;
        } else {
            e.messages.push((
                session,
                frame(
                    hanabi_protocol::server::TABLE_START,
                    TableStarted {
                        table_id: TableId(self.table.id),
                        replay,
                    },
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
        e.statuses.push((session.clone(), Status::Lobby, None));
        e.messages.push((
            session,
            frame(
                hanabi_protocol::server::LEFT,
                TableRequest {
                    table_id: TableId(self.table.id),
                },
            ),
        ));
        if matches!(self.table.phase, Phase::Pregame { .. }) {
            self.pregame_messages(&mut e);
        }
        for message in notices {
            self.add_chat(&mut e, &message);
        }
        self.spectator_messages(&mut e);
        self.publish(e).await?;
        if matches!(self.table.phase, Phase::Replay { .. }) && self.attendees.is_empty() {
            self.retire().await?;
        }
        Ok(())
    }
    async fn start(&mut self, session: Arc<Session>) -> Result<()> {
        ensure!(
            self.attending(&session) && session.user == self.table.owner,
            "Only the attended owner can start"
        );
        let Phase::Pregame { players, .. } = &self.table.phase else {
            bail!("Already started");
        };
        ensure!(
            hanabi_protocol::is_player_count(players.len()),
            "You need at least {MIN_PLAYERS} players"
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
        // A replayed game keeps its seats; a new game shuffles them after the deck.
        let deck = hanabi_engine::prepare_deck_and_players(
            variant,
            &seed,
            &mut players,
            extra.custom_seed.is_none(),
        )?;
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
            if a.kind.is_game_over() {
                game.terminate(
                    actor,
                    EndCondition::try_from(a.value).map_err(anyhow::Error::msg)?,
                    a.target,
                    None,
                    None,
                )?;
            } else {
                game.apply(actor, *a)?;
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
                    truncate(options.time_base * f64::from(CLOCK_UNITS_PER_SECOND))
                } else {
                    0
                };
                n
            ],
            duration: 0,
            turn_elapsed: 0,
            timer_started: false,
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
                    Status::SharedReplay
                } else if a.spectator {
                    Status::Spectating
                } else {
                    Status::Playing
                },
                Some(self.table.id),
            ));
            e.messages.push((
                a.session.clone(),
                frame(
                    hanabi_protocol::server::TABLE_START,
                    TableStarted {
                        table_id: TableId(self.table.id),
                        replay,
                    },
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
    async fn action(&mut self, session: Arc<Session>, a: ReplayAction) -> Result<()> {
        ensure!(self.attending(&session), "Reattend before acting");
        let seat = self.seat(&session)?;
        let old = self.live()?;
        hanabi_engine::validate_action(&old.game.0, seat, &hanabi_engine::PlayerAction::from(&a))?;
        let from = old.game.events.len();
        let mut next = self.candidate();
        let s = next.game_mut().expect("game");
        if s.game.options.timed {
            s.clocks[seat] += s.game.options.time_per_turn * i64::from(CLOCK_UNITS_PER_SECOND);
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
            s.pause_player_index = hanabi_engine::int(active);
            s.game.paused = true;
        }
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
                    player_index: hanabi_engine::int(seat),
                }
            } else {
                Recipient::Spectator {
                    shadowing_player_index: a.shadow.map(hanabi_engine::int),
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
                        hanabi_protocol::server::GAME_ACTION,
                        game_action(self.table.id, &event),
                    ),
                ));
            }
        }
        if replay {
            self.add_all(&mut e, hanabi_protocol::server::CONNECTED, self.connected());
            self.spectator_messages(&mut e);
            let count = if s.game_id > 0 {
                self.store.seed_count(&s.seed).await?
            } else {
                0
            };
            for a in self.audience() {
                e.statuses.push((
                    a.session.clone(),
                    if self.table.visible {
                        Status::SharedReplay
                    } else {
                        Status::Replay
                    },
                    Some(self.table.id),
                ));
                if s.players.iter().any(|p| p.id == a.session.user) {
                    e.messages.push((
                        a.session.clone(),
                        frame(
                            hanabi_protocol::server::GAME_HISTORY,
                            hanabi_protocol::GameHistoryList(vec![s.history(count, true)]),
                        ),
                    ));
                }
                e.messages.push((
                    a.session.clone(),
                    frame(
                        hanabi_protocol::server::FINISH_ONGOING_GAME,
                        hanabi_protocol::FinishOngoingGame {
                            table_id: TableId(self.table.id),
                            database_id: i64::from(s.game_id),
                            shared_replay_leader: self.leader_name(),
                        },
                    ),
                ));
                e.messages.push((
                    a.session.clone(),
                    frame(
                        hanabi_protocol::server::CARD_IDENTITIES,
                        self.card_identities(s),
                    ),
                ));
                e.messages.push((
                    a.session.clone(),
                    frame(
                        hanabi_protocol::server::NOTE_LIST,
                        hanabi_protocol::NoteList {
                            table_id: TableId(self.table.id),
                            notes: self.observer_notes(a),
                        },
                    ),
                ));
            }
            self.add_all(&mut e, hanabi_protocol::server::CLOCK, self.clock());
        } else {
            self.add_all(&mut e, hanabi_protocol::server::CLOCK, self.clock());
            if s.game.paused {
                self.add_all(
                    &mut e,
                    hanabi_protocol::server::PAUSE,
                    hanabi_protocol::Pause {
                        table_id: TableId(self.table.id),
                        active: true,
                        player_index: i64::from(s.pause_player_index),
                    },
                );
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
    async fn terminate(&mut self, session: Arc<Session>, vote: bool) -> Result<()> {
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
                if vote { -1 } else { hanabi_engine::int(seat) },
                votes,
                Some(CompletionTiming {
                    player_times: s.clocks.clone(),
                    duration: s.duration,
                }),
            )?;
        }
        self.persist(next).await?;
        let mut e = self.effects();
        if vote {
            e.messages.push((
                session,
                frame(
                    hanabi_protocol::server::VOTE_CHANGE,
                    hanabi_protocol::VoteChange {
                        vote: self.table.game().expect("game").votes[seat],
                    },
                ),
            ));
        }
        self.publish(e).await?;
        if terminate {
            self.transitions(from).await?;
        }
        Ok(())
    }
    /// A player keeps an idle game going, restarting its idle timer.
    async fn idle_reset(&mut self, session: Arc<Session>) -> Result<()> {
        ensure!(self.attending(&session), "Not attending");
        self.seat(&session)?;
        self.live()?;
        let mut next = self.candidate();
        next.game_mut().context("Missing game")?.idle_remaining = IDLE_TIMEOUT_MS;
        // Like arrows and sounds, an idle reset only restarts the idle timer, so it skips the durable
        // write.
        self.apply_without_checkpoint(next)?;
        self.idle_warned = false;
        let mut e = self.effects();
        self.add_all(
            &mut e,
            hanabi_protocol::server::IDLE_RESET,
            TableRequest {
                table_id: TableId(self.table.id),
            },
        );
        self.publish(e).await
    }
    async fn pause(
        &mut self,
        session: Arc<Session>,
        mut setting: hanabi_protocol::PauseSetting,
    ) -> Result<()> {
        use hanabi_protocol::PauseSetting as P;
        ensure!(self.attending(&session), "Not attending");
        let seat = self.seat(&session)?;
        let old = self.live()?;
        ensure!(old.game.options.timed, "This is not a timed game");
        if setting == P::PauseQueue && seat == old.game.active_player_index {
            setting = P::Pause;
        }
        ensure!(
            match setting {
                P::Pause => !old.game.paused,
                P::Unpause => old.game.paused,
                P::PauseQueue => !old.queued_pauses[seat],
                P::PauseUnqueue => old.queued_pauses[seat],
            },
            "Pause setting already applied"
        );
        let mut next = self.candidate();
        let s = next.game_mut().expect("game");
        match setting {
            P::PauseQueue | P::PauseUnqueue => s.queued_pauses[seat] = setting == P::PauseQueue,
            P::Pause | P::Unpause => {
                s.game.paused = setting == P::Pause;
                s.pause_player_index = if s.game.paused {
                    hanabi_engine::int(seat)
                } else {
                    -1
                };
                if !s.game.paused {
                    s.turn_elapsed = 0;
                }
            }
        }
        self.persist(next).await?;
        let s = self.table.game().expect("game");
        let mut e = self.effects();
        if matches!(setting, P::Pause | P::Unpause) {
            self.add_all(
                &mut e,
                hanabi_protocol::server::PAUSE,
                hanabi_protocol::Pause {
                    table_id: TableId(self.table.id),
                    active: s.game.paused,
                    player_index: i64::from(s.pause_player_index),
                },
            );
            self.add_all(&mut e, hanabi_protocol::server::CLOCK, self.clock());
        }
        self.publish(e).await
    }
    async fn note(&mut self, session: Arc<Session>, order: u64, note: &str) -> Result<()> {
        ensure!(self.attending(&session), "Not attending");
        self.live()?;
        let order = usize::try_from(order)?;
        let text = crate::accounts::truncate_to_max_bytes(note, MAX_NOTE_LENGTH);
        let text = crate::accounts::remove_disallowed_characters(text)
            .trim()
            .to_owned();
        ensure!(
            crate::accounts::max_consecutive_marks(&text) <= crate::accounts::MAX_CONSECUTIVE_MARKS,
            "Notes cannot contain more than {} consecutive diacritics.",
            crate::accounts::MAX_CONSECUTIVE_MARKS
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
        self.persist(next).await?;
        let mut e = self.effects();
        for a in self.audience().filter(|a| a.spectator) {
            let notes = self
                .observer_notes(a)
                .into_iter()
                .map(|n| hanabi_protocol::CardNote {
                    text: n.notes.get(order).cloned().unwrap_or_default(),
                    name: n.name,
                    is_spectator: n.is_spectator,
                })
                .collect();
            e.messages.push((
                a.session.clone(),
                frame(
                    hanabi_protocol::server::NOTE,
                    hanabi_protocol::Note {
                        table_id: TableId(self.table.id),
                        order: i64::try_from(order)?,
                        notes,
                    },
                ),
            ));
        }
        self.publish(e).await
    }
    fn observer_notes(&self, a: &Attendance) -> Vec<hanabi_protocol::PlayerNotes> {
        let Some(s) = self.table.game() else {
            return vec![];
        };
        let mut notes = vec![];
        for (i, p) in s.players.iter().enumerate() {
            if a.shadow.is_none_or(|shadow| shadow == i)
                || matches!(self.table.phase, Phase::Replay { .. })
            {
                notes.push(hanabi_protocol::PlayerNotes {
                    name: p.name.clone(),
                    notes: s.notes[i].clone(),
                    is_spectator: false,
                });
            }
        }
        for (id, n) in &s.spectator_notes {
            if *id == a.session.user || a.shadow.is_none() {
                notes.push(hanabi_protocol::PlayerNotes {
                    name: n.name.clone(),
                    notes: n.notes.clone(),
                    is_spectator: true,
                });
            }
        }
        for spectator in self
            .audience()
            .filter(|p| p.spectator && !s.spectator_notes.contains_key(&p.session.user))
        {
            if a.shadow.is_none() || spectator.session.user == a.session.user {
                notes.push(hanabi_protocol::PlayerNotes {
                    name: spectator.session.name.clone(),
                    notes: vec![String::new(); s.game.deck.len() + s.game.stacks.len()],
                    is_spectator: true,
                });
            }
        }
        notes
    }
    async fn tag(
        &mut self,
        session: Arc<Session>,
        raw: &str,
        room: &str,
        operation: &str,
    ) -> Result<()> {
        ensure!(self.attending(&session), "Not attending");
        ensure!(raw.len() <= MAX_TAG_LENGTH, tag_too_long());
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
                message: json!(message),
            });
        } else {
            message.room = Some(room.to_owned());
            message.recipient = Some(session.name.clone());
        }
        self.persist(next).await?;
        let mut e = self.effects();
        if replay {
            self.add_chat(&mut e, &message);
        } else {
            e.messages
                .push((session, frame(hanabi_protocol::server::CHAT, message)));
        }
        self.publish(e).await
    }
    async fn leader(&mut self, session: Arc<Session>, name: &str) -> Result<()> {
        ensure!(self.attending(&session), "Not attending");
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
            message: json!(message),
        });
        self.persist(next).await?;
        let mut e = self.effects();
        self.add_chat(&mut e, &message);
        self.add_all(
            &mut e,
            hanabi_protocol::server::REPLAY_LEADER,
            hanabi_protocol::ReplayLeader {
                table_id: TableId(self.table.id),
                name: target.1.clone(),
            },
        );
        if matches!(self.table.phase, Phase::Pregame { .. }) {
            self.pregame_messages(&mut e);
        }
        self.publish(e).await
    }
    async fn suggest(&self, session: Arc<Session>, segment: i64) -> Result<()> {
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
                hanabi_protocol::server::SUGGESTION,
                hanabi_protocol::Suggestion {
                    table_id: TableId(self.table.id),
                    user_name: session.name.clone(),
                    segment,
                },
            ),
        ));
        self.publish(e).await
    }
    async fn replay_action(
        &mut self,
        session: Arc<Session>,
        r: hanabi_protocol::ReplayActionRequest,
    ) -> Result<()> {
        use hanabi_protocol::ReplayActionRequest as R;

        ensure!(
            self.attending(&session) && session.user == self.table.owner && self.table.visible,
            "You must lead this shared replay"
        );
        let mut next = self.candidate();
        let Phase::Replay { snapshot, replay } = &mut next.phase else {
            bail!("Not a replay");
        };
        // Arrows and sounds only reset the idle timer, so they skip the durable write.
        let checkpoint = !matches!(r, R::Arrow { .. } | R::Sound { .. });
        let message = match r {
            R::Segment { segment, .. } => {
                replay.segment = segment;
                Outgoing::new(
                    hanabi_protocol::server::REPLAY_SEGMENT,
                    hanabi_protocol::ReplaySegment {
                        table_id: TableId(self.table.id),
                        segment: i64::from(segment),
                    },
                )
            }
            R::Arrow { order, .. } => Outgoing::new(
                hanabi_protocol::server::REPLAY_INDICATOR,
                hanabi_protocol::ReplayIndicator {
                    table_id: TableId(self.table.id),
                    order,
                },
            ),
            R::Sound { sound, .. } => Outgoing::new(
                hanabi_protocol::server::REPLAY_SOUND,
                hanabi_protocol::ReplaySound {
                    table_id: TableId(self.table.id),
                    sound,
                },
            ),
            R::HypoStart { .. } => {
                ensure!(!replay.hypothetical, "Already hypothetical");
                replay.hypothetical = true;
                replay.show_drawn_cards = false;
                Outgoing::new(
                    hanabi_protocol::server::HYPO_START,
                    TableRequest {
                        table_id: TableId(self.table.id),
                    },
                )
            }
            R::HypoEnd { .. } => {
                ensure!(replay.hypothetical, "Not hypothetical");
                replay.hypothetical = false;
                replay.hypothetical_actions.clear();
                Outgoing::new(
                    hanabi_protocol::server::HYPO_END,
                    TableRequest {
                        table_id: TableId(self.table.id),
                    },
                )
            }
            R::HypoAction { action, .. } => {
                // Stored as JSON text, the format table checkpoints have always used.
                let raw = serde_json::to_string(&action)?;
                ensure!(
                    replay.hypothetical_actions.len() < crate::model::MAX_HYPOTHETICAL_ACTIONS
                        && replay
                            .hypothetical_actions
                            .iter()
                            .map(String::len)
                            .sum::<usize>()
                            + raw.len()
                            <= crate::model::MAX_HYPOTHETICAL_BYTES,
                    "Too many hypothetical actions"
                );
                replay.hypothetical_actions.push(raw);
                Outgoing::new(hanabi_protocol::server::HYPO_ACTION, action)
            }
            R::HypoBack { .. } => {
                replay.hypothetical_actions.pop();
                while replay.hypothetical_actions.last().is_some_and(|v| {
                    serde_json::from_str::<Value>(v).is_ok_and(|v| v["type"] != "turn")
                }) {
                    replay.hypothetical_actions.pop();
                }
                Outgoing::new(
                    hanabi_protocol::server::HYPO_BACK,
                    TableRequest {
                        table_id: TableId(self.table.id),
                    },
                )
            }
            R::HypoToggleRevealed { .. } => {
                replay.show_drawn_cards = !replay.show_drawn_cards;
                Outgoing::new(
                    hanabi_protocol::server::HYPO_SHOW_DRAWN_CARDS,
                    hanabi_protocol::HypoShowDrawnCards {
                        table_id: TableId(self.table.id),
                        show_drawn_cards: replay.show_drawn_cards,
                    },
                )
            }
            R::EfficiencyMod { r#mod, .. } => {
                replay.efficiency_modifier = r#mod;
                Outgoing::new(
                    hanabi_protocol::server::REPLAY_EFFICIENCY_MOD,
                    hanabi_protocol::ReplayEfficiencyMod {
                        table_id: TableId(self.table.id),
                        r#mod: replay.efficiency_modifier,
                    },
                )
            }
        };
        snapshot.idle_remaining = IDLE_TIMEOUT_MS;
        if checkpoint {
            self.persist(next).await?;
        } else {
            self.apply_without_checkpoint(next)?;
        }
        let mut e = self.effects();
        self.add_outgoing(&mut e, &message);
        self.publish(e).await
    }
    async fn chat_presence(&mut self, session: Arc<Session>, typing: bool) -> Result<()> {
        ensure!(self.attending(&session), "Not attending");
        let a = self.attendees.get_mut(&session.user).expect("attendee");
        let notify = typing && a.typing_until.is_none();
        if typing {
            a.typing_until = Some(Instant::now() + TYPING_TIMEOUT);
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
    async fn chat(&mut self, session: Arc<Session>, msg: &str) -> Result<()> {
        ensure!(self.attending(&session), "Not attending");
        let text = crate::accounts::normalize_chat(msg).map_err(anyhow::Error::msg)?;
        // Every message rewrites the table's checkpoint, so its cost grows with the chat.
        if let Err(wait) = self.chat_limit.charge(session.user, Instant::now()) {
            bail!(
                "You are sending messages too quickly. Please wait {} seconds.",
                wait.as_secs().max(1)
            );
        }
        ensure!(
            player_chat_has_room(&self.table.chat)?,
            "Chat history is full"
        );
        if let Some(response) = crate::lobby::general_response(&text) {
            let responses = match response {
                crate::lobby::GeneralResponse::Private(response) => {
                    let mut e = self.effects();
                    let mut message = server_chat(self.table.id, &response);
                    message.recipient = Some(session.name.clone());
                    e.messages
                        .push((session, frame(hanabi_protocol::server::CHAT, message)));
                    return self.publish(e).await;
                }
                crate::lobby::GeneralResponse::Public(response) => vec![response],
                crate::lobby::GeneralResponse::Runtime { command, args } => {
                    self.info.runtime_response(&command, &args)?
                }
            };
            let mut messages = vec![authored_chat(self.table.id, &session.name, &text)];
            messages.extend(
                responses
                    .iter()
                    .map(|response| server_chat(self.table.id, response)),
            );
            let mut next = self.candidate();
            ensure!(
                next.chat.len() + messages.len() <= crate::model::MAX_TABLE_CHAT,
                "Chat history is full"
            );
            for (index, message) in messages.iter().enumerate() {
                next.chat.push(TableChat {
                    id: None,
                    user: if index == 0 { session.user } else { 0 },
                    message: json!(message),
                });
            }
            self.persist(next).await?;
            let mut e = self.effects();
            for message in messages {
                self.add_chat(&mut e, &message);
            }
            return self.publish(e).await;
        }
        // Unknown slash commands are ordinary table messages for bots.
        if matches!(
            crate::lobby::classify_chat(&text),
            crate::lobby::Classification::Public | crate::lobby::Classification::Private
        ) {
            return self.chat_command(session, &text).await;
        }
        let message = authored_chat(self.table.id, &session.name, &text);
        let mut next = self.candidate();
        ensure!(
            next.chat.len() < crate::model::MAX_TABLE_CHAT,
            "Chat history is full"
        );
        next.chat.push(TableChat {
            id: None,
            user: session.user,
            message: json!(message),
        });
        self.persist(next).await?;
        let typing = self
            .attendees
            .get_mut(&session.user)
            .is_some_and(|a| a.typing_until.take().is_some());
        let mut e = self.effects();
        self.add_chat(&mut e, &message);
        if typing {
            self.typing_messages(&mut e, session.user, &session.name, false);
        }
        self.publish(e).await
    }
    async fn chat_command(&mut self, session: Arc<Session>, text: &str) -> Result<()> {
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
                hanabi_protocol::is_player_count(participants.len()),
                "This command requires {MIN_PLAYERS} to {MAX_PLAYERS} participants"
            );
            let message = format!(
                "{}/shared-missing-scores/{}/{}",
                self.info.public_url(""),
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
                message: json!(message),
            });
            self.persist(next).await?;
            let mut e = self.effects();
            self.add_chat(&mut e, &message);
            return self.publish(e).await;
        }
        if command == "tags" || command == "taglist" {
            let messages = if matches!(self.table.phase, Phase::Replay { .. }) {
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
            } else {
                vec!["You can only perform this command while in a replay.".to_owned()]
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
                    message: json!(message),
                });
            }
            self.persist(next).await?;
            let mut e = self.effects();
            for message in messages {
                self.add_chat(&mut e, &message);
            }
            return self.publish(e).await;
        }
        if command == "suggest" {
            ensure!(args.len() == 1, "Expected /suggest [turn]");
            return self
                .suggest(session, i64::from(args[0].parse::<i32>()?))
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
                ensure!(
                    hanabi_protocol::is_player_count(n),
                    "Tables require {MIN_PLAYERS} to {MAX_PLAYERS} players"
                );
                *automatic_start = Some(n);
                *countdown = None;
                notice = format!("The game will start as soon as {n} players have joined.");
            }
            "si" | "startin" => {
                ensure!(args.len() == 1, "Expected /startin [minutes]");
                let minutes = parse_start_minutes(args[0]).context("Invalid countdown number")?;
                ensure!(
                    minutes.is_finite() && minutes > 0.0 && minutes <= MAX_START_IN_MINUTES,
                    "Minutes must be between zero and {MAX_START_IN_MINUTES}"
                );
                let seconds = truncate((minutes * f64::from(SECONDS_PER_MINUTE)).ceil());
                *countdown = Some(Utc::now() + ChronoDuration::seconds(seconds));
                let wait = match seconds.cmp(&i64::from(SECONDS_PER_MINUTE)) {
                    Ordering::Less => format!("{seconds} seconds"),
                    Ordering::Equal => "1 minute".into(),
                    Ordering::Greater => {
                        format!("{} minutes", crate::accounts::escape_html(args[0]))
                    }
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
                        message.recipient = Some(a.session.name.clone());
                        e.messages.push((
                            a.session.clone(),
                            frame(hanabi_protocol::server::CHAT, message),
                        ));
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
            message: json!(authored),
        });
        next.chat.push(TableChat {
            id: None,
            user: 0,
            message: json!(notice),
        });
        self.persist(next).await?;
        let mut e = self.effects();
        if let Some(user) = boot
            && let Some(a) = self.attendees.remove(&user)
        {
            e.statuses.push((a.session.clone(), Status::Lobby, None));
            e.messages.push((
                a.session,
                frame(
                    hanabi_protocol::server::LEFT,
                    TableRequest {
                        table_id: TableId(self.table.id),
                    },
                ),
            ));
        }
        self.pregame_messages(&mut e);
        self.add_chat(&mut e, &authored);
        self.add_chat(&mut e, &notice);
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
                frame(
                    hanabi_protocol::server::BOOT,
                    TableRequest {
                        table_id: TableId(self.table.id),
                    },
                ),
            ));
            effects
                .statuses
                .push((session.clone(), Status::Lobby, None));
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
        let selected_ids = selected.iter().map(|p| p.id).collect::<HashSet<_>>();
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
            "{}{SPLIT_SUFFIX}",
            crate::accounts::truncate_to_max_bytes(
                self.table.name.trim(),
                MAX_TABLE_NAME_LENGTH - SPLIT_SUFFIX.len()
            )
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
        destination.shadows.clear();
        let moving = self
            .audience()
            .filter(|a| selected_ids.contains(&a.session.user))
            .map(|a| (a.session.clone(), false, None))
            .collect();
        self.transfer(source, destination, allocation, moving, retire)
            .await
    }
    async fn restart(&mut self, session: Arc<Session>, hide: bool) -> Result<()> {
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
            players.len() >= MIN_PLAYERS && (!hide || players.len() == self.table.players().len()),
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
            let (base, count) =
                if let Some(m) = regex!(r"^(.*) \(#(\d+)\)$").captures(&self.table.name) {
                    (m[1].to_owned(), m[2].parse::<u64>()? + 1)
                } else {
                    (self.table.name.clone(), 2)
                };
            let suffix = format!(" (#{count})");
            format!(
                "{}{suffix}",
                crate::accounts::truncate_to_max_bytes(&base, MAX_TABLE_NAME_LENGTH - suffix.len())
            )
        };
        destination.extra = ExtraOptions {
            set_seed_suffix: destination.name.strip_prefix("!seed ").unwrap_or("").into(),
            ..ExtraOptions::default()
        };
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
            let (segment, efficiency, spoiler_free) =
                if let Phase::Replay { replay, .. } = &self.table.phase {
                    (
                        replay.segment,
                        replay.efficiency_modifier,
                        replay.spoiler_free,
                    )
                } else {
                    (s.game.turn, 0, false)
                };
            let init = hanabi_protocol::Init {
                table_id: TableId(self.table.id),
                player_names: s.players.iter().map(|p| p.name.clone()).collect(),
                our_player_index: int(a.shadow.or(display_seat).unwrap_or(0)),
                spectating: a.spectator && !replay,
                shadowing: a.shadow.is_some() && !replay,
                replay,
                database_id: if replay { s.game_id.into() } else { -1 },
                has_custom_seed: self.table.extra.custom_seed.is_some(),
                seed: s.seed.clone(),
                datetime_started: crate::model::timestamp(s.started),
                // An unfinished game has no finish time; this is the start of year 1.
                datetime_finished: s.finished.map_or_else(
                    || "0001-01-01T00:00:00.000Z".into(),
                    crate::model::timestamp,
                ),
                options: wire_options(&s.game.options),
                character_assignments: if s.game.options.detrimental_characters {
                    s.game
                        .players
                        .iter()
                        .map(|p| {
                            hanabi_engine::characters()
                                .iter()
                                .find(|c| c.name == p.character)
                                .map_or(SafeInteger(-1), |c| SafeInteger(c.id.into()))
                        })
                        .collect()
                } else {
                    vec![]
                },
                character_metadata: if s.game.options.detrimental_characters {
                    s.game
                        .players
                        .iter()
                        .map(|p| SafeInteger(p.character_metadata.into()))
                        .collect()
                } else {
                    vec![]
                },
                shared_replay: replay && self.table.visible,
                shared_replay_leader: self.leader_name(),
                shared_replay_segment: segment.into(),
                shared_replay_eff_mod: efficiency.into(),
                spoiler_free,
                paused: s.game.paused,
                pause_player_index: s.pause_player_index.into(),
                pause_queued: seat.is_some_and(|i| s.queued_pauses[i]),
            };
            e.messages
                .push((session.clone(), frame(hanabi_protocol::server::INIT, init)));
        } else {
            let recipient = if replay {
                Recipient::Spectator {
                    shadowing_player_index: None,
                }
            } else if !a.spectator {
                Recipient::Player {
                    player_index: hanabi_engine::int(seat.context("Missing player")?),
                }
            } else {
                Recipient::Spectator {
                    shadowing_player_index: a.shadow.map(hanabi_engine::int),
                }
            };
            let list = hanabi_engine::events_for_recipient(&s.game.0, recipient, None)?;
            e.messages.push((
                session.clone(),
                frame(
                    hanabi_protocol::server::GAME_ACTION_LIST,
                    game_action_list(self.table.id, &list),
                ),
            ));
            if replay {
                e.messages.push((
                    session.clone(),
                    frame(
                        hanabi_protocol::server::CARD_IDENTITIES,
                        self.card_identities(s),
                    ),
                ));
            }
            if replay || a.spectator {
                e.messages.push((
                    session.clone(),
                    frame(
                        hanabi_protocol::server::NOTE_LIST,
                        hanabi_protocol::NoteList {
                            table_id: TableId(self.table.id),
                            notes: self.observer_notes(a),
                        },
                    ),
                ));
            } else if let Some(seat) = seat {
                e.messages.push((
                    session.clone(),
                    frame(
                        hanabi_protocol::server::NOTE_LIST_PLAYER,
                        hanabi_protocol::NoteListPlayer {
                            table_id: TableId(self.table.id),
                            notes: s.notes[seat].clone(),
                        },
                    ),
                ));
                e.messages.push((
                    session.clone(),
                    frame(
                        hanabi_protocol::server::VOTE_CHANGE,
                        hanabi_protocol::VoteChange {
                            vote: s.votes[seat],
                        },
                    ),
                ));
            }
            e.messages.push((
                session.clone(),
                frame(hanabi_protocol::server::CONNECTED, self.connected()),
            ));
            if !replay {
                e.messages.push((
                    session.clone(),
                    frame(hanabi_protocol::server::CLOCK, self.clock()),
                ));
            }
            self.chat_history(&mut e, &session)?;
            e.messages.push((
                session.clone(),
                frame(
                    hanabi_protocol::server::SPECTATORS,
                    hanabi_protocol::Spectators {
                        table_id: TableId(self.table.id),
                        spectators: self.spectators(),
                    },
                ),
            ));
            for a in self
                .audience()
                .filter(|a| a.session.user != session.user && a.typing_until.is_some())
            {
                e.messages.push((
                    session.clone(),
                    frame(
                        hanabi_protocol::server::CHAT_TYPING,
                        ChatTyping {
                            table_id: TableId(self.table.id),
                            name: a.session.name.clone(),
                            typing: true,
                        },
                    ),
                ));
            }
            if let Phase::Replay { replay, .. } = &self.table.phase
                && replay.hypothetical
            {
                e.messages.push((
                    session,
                    frame(
                        hanabi_protocol::server::HYPOTHETICAL,
                        hanabi_protocol::Hypothetical {
                            show_drawn_cards: replay.show_drawn_cards,
                            actions: replay
                                .hypothetical_actions
                                .iter()
                                .map(|raw| hanabi_protocol::decode(&serde_json::from_str(raw)?))
                                .collect::<Result<_>>()
                                .context("Invalid stored hypothetical action")?,
                        },
                    ),
                ));
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
                return self.start(owner).await;
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
        // Warn the table once before the game ends for inactivity. The warning is sent again after
        // a turn or an idle reset restarts the timer.
        if s.idle_remaining > IDLE_WARNING_MS {
            self.idle_warned = false;
        } else if !idle && !self.idle_warned {
            self.idle_warned = true;
            let remaining_ms = s.idle_remaining;
            let mut e = self.effects();
            self.add_all(
                &mut e,
                hanabi_protocol::server::IDLE_WARNING,
                IdleWarning {
                    table_id: TableId(self.table.id),
                    remaining_ms,
                },
            );
            self.publish(e).await?;
        }
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
                if idle { -1 } else { hanabi_engine::int(active) },
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
            e.statuses.push((a.session.clone(), Status::Lobby, None));
            e.messages.push((
                a.session.clone(),
                frame(
                    hanabi_protocol::server::BOOT,
                    TableRequest {
                        table_id: TableId(self.table.id),
                    },
                ),
            ));
        }
        self.publish(e).await?;
        self.hub.send(HubCommand::Retire(self.table.id)).await?;
        self.retired = true;
        Ok(())
    }
}
