use crate::{
    lobby::{Effect, OnlineUser},
    model::{Snapshot, TableSnapshot},
    operations::Operation,
    server_info::ServerInfo,
    store::Store,
    transport::Session,
};
use anyhow::{Result, ensure};
use hanabi_protocol::{ClientMessage, NO_VALUE, Status};
use serde_json::Value;
use std::{
    collections::{BTreeMap, HashMap, HashSet},
    sync::{Arc, Mutex},
    time::{Duration, Instant},
};
use tokio::sync::{Notify, OwnedSemaphorePermit, mpsc, oneshot};
use tokio_util::task::TaskTracker;
#[cfg(test)]
use {
    anyhow::Context,
    hanabi_protocol::{TableId, UserId},
};

#[cfg(test)]
mod protocol_tests;
mod replay_helpers;
#[cfg(test)]
mod tests;

mod chat;
mod hub;
mod membership;
mod play;
mod pregame;
mod replay;
mod setup;
mod table;
mod wire;

pub use hub::Hub;
type Reply = oneshot::Sender<Result<()>>;

const PREGAME_RECONNECT_GRACE: Duration = Duration::from_secs(60);
const REPLAY_RECONNECT_GRACE: Duration = Duration::from_secs(60);
/// `NO_VALUE` in the one-byte fields that name the seat a spectator shadows.
#[expect(clippy::cast_possible_truncation, reason = "NO_VALUE fits in a byte")]
const NO_SHADOWED_SEAT: i8 = NO_VALUE as i8;

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
        database_id: None,
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
        friends: vec![],
        playing_at_tables: vec![],
        discon_spectating_table: None,
        discon_shadowing_seat: None,
    }
}
/// The part of a game that a client requests as it loads one: first the setup, then the state.
#[derive(Clone, Copy, PartialEq, Eq)]
enum GameInfo {
    Init,
    State,
}

/// A pregame change to a table: only its variant, or every option.
enum TableChange {
    Variant(String),
    Options(Box<hanabi_protocol::TableUpdateRequest>),
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
