use crate::{
    errors::CommandResult,
    lobby::{OnlineUser, Publication},
    model::{Seat, TableSnapshot},
    operations::Operation,
    server_info::ServerInfo,
    store::{Saved, Store},
    transport::{Outgoing, Session},
};
#[cfg(test)]
use anyhow::Context;
use anyhow::Result;
use hanabi_protocol::GameId;
use hanabi_protocol::TableId;
use hanabi_protocol::UserId;
use hanabi_protocol::{ClientMessage, Status};
use serde::Serialize;
use serde_json::Value;
use std::{
    collections::{BTreeMap, BTreeSet, HashMap, HashSet},
    sync::Arc,
    time::{Duration, Instant},
};
use tokio::sync::{Notify, OwnedSemaphorePermit, mpsc, oneshot};
use tokio_util::task::TaskTracker;

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
type Reply = oneshot::Sender<CommandResult>;

const PREGAME_RECONNECT_GRACE: Duration = Duration::from_secs(60);
const REPLAY_RECONNECT_GRACE: Duration = Duration::from_secs(60);

pub struct Allocation {
    pub id: TableId,
    permit: Option<OwnedSemaphorePermit>,
    cleanup: Option<(Store, TaskTracker)>,
    revision: i64,
    reservation: Option<SeatReservation>,
}
/// The hub's hold on the seats of users with a pending request to play at a table, such as a join
/// or a table creation. While it lasts, those users cannot start another such request. The hub ends
/// it when the request finishes; a reservation dropped earlier asks the hub to end it.
pub struct SeatReservation {
    id: u64,
    users: Vec<UserId>,
    hub: Option<mpsc::Sender<HubCommand>>,
}
impl SeatReservation {
    /// The reservation's ID and users, for the hub to end it. Dropping it afterward does nothing.
    fn take(mut self) -> (u64, Vec<UserId>) {
        self.hub = None;
        (self.id, std::mem::take(&mut self.users))
    }
}
impl Drop for SeatReservation {
    fn drop(&mut self) {
        let Some(hub) = self.hub.take() else {
            return;
        };
        let end = HubCommand::EndReservation {
            id: self.id,
            users: std::mem::take(&mut self.users),
        };
        if let Err(mpsc::error::TrySendError::Full(end)) = hub.try_send(end) {
            tokio::spawn(async move {
                let _ = hub.send(end).await;
            });
        }
    }
}
impl Allocation {
    fn new(
        id: TableId,
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
            reservation: None,
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
            let reservation = self.reservation.take();
            tasks.spawn(async move {
                if let Err(error) = store.remove(id, revision).await {
                    eprintln!("Uninstalled table {id} cleanup failed: {error}");
                }
                drop(permit);
                drop(reservation);
            });
        }
    }
}
#[derive(Clone, PartialEq)]
pub struct TableView {
    players: Vec<UserId>,
    replay: bool,
    /// The database game shown by a replay.
    replay_game: Option<GameId>,
    visible: bool,
    data: hanabi_protocol::Table,
    inspection: TableInspection,
    reconnects: BTreeMap<UserId, Option<Seat>>,
}
/// A table's state as the operations endpoint reports it.
#[derive(Clone, Copy, Default, PartialEq, Serialize)]
struct TableInspection {
    running: bool,
    replay: bool,
    frozen: bool,
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
/// A connected user, as the hub keeps them.
struct Presence {
    session: Arc<Session>,
    status: Status,
    table: Option<TableId>,
    h_group: bool,
    h_group_level: u8,
    inactive: bool,
    blocks: Blocks,
}
impl Presence {
    fn new(session: Arc<Session>, settings: &hanabi_protocol::Settings, blocks: Blocks) -> Self {
        Self {
            session,
            status: Status::Lobby,
            table: None,
            h_group: settings.h_group_conventions,
            h_group_level: settings.h_group_level,
            inactive: false,
            blocks,
        }
    }
}
/// The users whom a user has blocked or was blocked by. The hub keeps each connected user's set
/// and sends it with the user's table commands.
pub type Blocks = Arc<BTreeSet<UserId>>;
pub struct Effects {
    pub table: TableId,
    pub view: TableView,
    pub statuses: Vec<(Arc<Session>, Status, Option<TableId>)>,
    pub messages: Vec<(Arc<Session>, String)>,
}
pub enum HubCommand {
    Register {
        session: Arc<Session>,
        blocks: BTreeSet<UserId>,
        welcome: hanabi_protocol::Welcome,
        initial: Vec<String>,
        reply: Reply,
    },
    Logout(Arc<Session>),
    Allocate(oneshot::Sender<CommandResult<Allocation>>),
    Client {
        session: Arc<Session>,
        message: ClientMessage,
        reply: Reply,
    },
    /// Fails for a stale session. The online users are listed only when `users` is set.
    Directory {
        session: Arc<Session>,
        users: bool,
        reply: oneshot::Sender<CommandResult<Vec<OnlineUser>>>,
    },
    LobbyEffects {
        session: Arc<Session>,
        effects: Vec<Publication>,
        reply: Reply,
    },
    /// Sends messages from outside the server, such as Discord, to everyone in the lobby.
    Broadcast {
        messages: Vec<Outgoing>,
        reply: Reply,
    },
    /// A join to a table finished; the hub ends its seat reservation and answers the request.
    JoinFinished {
        result: CommandResult,
        reply: Reply,
        reservation: SeatReservation,
    },
    /// Reserves seats for users who move from table `from` to a new table, such as in a split.
    ReserveSeats {
        users: Vec<UserId>,
        from: TableId,
        reply: oneshot::Sender<CommandResult<SeatReservation>>,
    },
    /// Ends a seat reservation that was dropped before its request finished.
    EndReservation {
        id: u64,
        users: Vec<UserId>,
    },
    Operations {
        command: Operation,
        reply: oneshot::Sender<Result<Value>>,
    },
    Sync {
        session: Arc<Session>,
        reply: Reply,
    },
    Effects(Effects),
    Retire(TableId),
    /// A table's task panicked.
    TableFailed(TableId),
    Install {
        table: Box<TableSnapshot>,
        saved: Saved,
        allocation: Allocation,
        session: Arc<Session>,
        warnings: Vec<String>,
        reply: Reply,
    },
    Spawn {
        table: Box<TableSnapshot>,
        saved: Saved,
        allocation: Allocation,
        attendees: Vec<(Arc<Session>, bool, Option<Seat>)>,
        chat_read: HashMap<UserId, usize>,
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
        shadow: Option<Seat>,
    },
}
pub enum TableCommand {
    Client {
        session: Arc<Session>,
        /// The user's blocks when the hub sent the command.
        blocks: Blocks,
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
    shadow: Option<Seat>,
    typing_until: Option<Instant>,
}
struct TableActor {
    table: TableSnapshot,
    /// What the database holds for the table.
    saved: Saved,
    frozen: bool,
    retired: bool,
    attendees: HashMap<UserId, Attendance>,
    chat_read: HashMap<UserId, usize>,
    pregame_absent_until: HashMap<UserId, Instant>,
    replay_absent_until: Option<Instant>,
    cleanup: Arc<Notify>,
    store: Store,
    hub: mpsc::Sender<HubCommand>,
    anchor: Instant,
    /// Whether the table was warned that the game is about to end for inactivity. Kept in memory:
    /// after a restart, the warning is sent again.
    idle_warned: bool,
    /// When the table may retry timed work that failed.
    timer_retry: Option<Instant>,
    /// Who the table was told tried to join it while it was full. Kept in memory: after a restart,
    /// the table can be told again.
    full_join_notices: HashSet<UserId>,
    /// When a player last joined the table, so that a burst of joins plays the join sound once.
    /// Kept in memory: after a restart, the next join plays it.
    last_join: Option<Instant>,
    /// Each player's recent table chat. Kept in memory: a restart forgives it.
    chat_limit: crate::accounts::Counter<i32>,
    _permit: OwnedSemaphorePermit,
    info: Arc<ServerInfo>,
}
