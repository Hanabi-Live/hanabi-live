use crate::{
    errors::CommandResult,
    lobby::{OnlineUser, Publication},
    model::TableSnapshot,
    operations::Operation,
    server_info::ServerInfo,
    store::{Saved, Store},
    transport::{Frame, Outgoing, Session},
};
#[cfg(test)]
use anyhow::Context;
use anyhow::Result;
use hanabi_protocol::ClientMessage;
use hanabi_protocol::GameId;
use hanabi_protocol::PlayerIndex;
use hanabi_protocol::TableId;
use hanabi_protocol::UserId;
#[cfg(test)]
use serde_json::Value;
use std::{
    collections::{BTreeMap, BTreeSet, HashMap},
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
mod pending;
mod play;
mod pregame;
mod replay;
mod setup;
mod table;
mod wire;

pub use hub::Hub;
type Reply = oneshot::Sender<CommandResult>;

/// Sends an actor a command that carries a reply channel, and waits for the reply.
pub async fn request<C, T>(
    actor: &mpsc::Sender<C>,
    command: impl FnOnce(oneshot::Sender<T>) -> C,
) -> Result<T> {
    let (reply, received) = oneshot::channel();
    actor
        .send(command(reply))
        .await
        .map_err(|_| anyhow::anyhow!("The {} actor stopped", actor_name::<C>()))?;
    received
        .await
        .map_err(|_| anyhow::anyhow!("The {} actor stopped before it answered", actor_name::<C>()))
}

/// The name of the actor that takes commands of type `C`, for errors.
fn actor_name<C>() -> &'static str {
    let name = std::any::type_name::<C>();
    name.rsplit("::").next().unwrap_or(name)
}

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
                    tracing::error!("Uninstalled table {id} cleanup failed: {error}");
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
    reconnects: BTreeMap<UserId, Option<PlayerIndex>>,
}
#[derive(Clone)]
pub struct TableHandle {
    pub sender: mpsc::Sender<TableCommand>,
    pub cleanup: Arc<Notify>,
}
struct Entry {
    handle: TableHandle,
    view: TableView,
    /// The table's attendees, as it last published them.
    attendees: BTreeSet<UserId>,
    published: bool,
}
/// What a connected user is doing. The hub keeps it with the user's table.
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum Status {
    Lobby,
    Pregame,
    Playing,
    Spectating,
    Replay,
    SharedReplay,
}
/// A connected user, as the hub keeps them.
struct Presence {
    session: Arc<Session>,
    status: Status,
    table: Option<TableId>,
    h_group: bool,
    h_group_level: Option<hanabi_protocol::HGroupLevel>,
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
    /// The users whom the table keeps as attendees, connected or not. The table publishes them so
    /// that the hub wakes only the tables of a user who connects or leaves.
    pub attendees: BTreeSet<UserId>,
    pub statuses: Vec<(Arc<Session>, Status, Option<TableId>)>,
    pub messages: Vec<(Arc<Session>, Frame)>,
}
pub enum HubCommand {
    Register {
        session: Arc<Session>,
        blocks: BTreeSet<UserId>,
        welcome: hanabi_protocol::Welcome,
        initial: Vec<Frame>,
        reply: Reply,
    },
    Logout(Arc<Session>),
    Allocate(oneshot::Sender<CommandResult<Allocation>>),
    Client {
        session: Arc<Session>,
        message: ClientMessage,
        reply: Reply,
    },
    /// Lists the online users, for a private message. Fails for a stale session.
    Directory {
        session: Arc<Session>,
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
        reply: oneshot::Sender<Result<()>>,
    },
    /// The tables have drained: tells every connection that the server is going down, then closes
    /// it. `reconnect` tells clients to reconnect, and `message` is the administrator's reason.
    Drained {
        reconnect: bool,
        message: Option<String>,
        reply: oneshot::Sender<Result<()>>,
    },
    /// Answers whether the hub runs and the server still owns the live tables, for the
    /// operations endpoint.
    Inspect(oneshot::Sender<Result<()>>),
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
        attendees: Vec<(Arc<Session>, bool, Option<PlayerIndex>)>,
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
        shadow: Option<PlayerIndex>,
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
/// Decodes a command the way the WebSocket parser does, for tests that build commands by name. A
/// test names only the table settings that it checks: the others take their defaults.
#[cfg(test)]
pub(crate) fn client_message(name: &str, data: &Value) -> Result<ClientMessage> {
    let mut data = data.clone();
    if matches!(name, "tableCreate" | "tableUpdate")
        && let Some(settings) = data.get_mut("settings").and_then(Value::as_object_mut)
    {
        let defaults = serde_json::to_value(hanabi_protocol::TableSettings::named(""))?;
        for field in ["maxPlayers", "options"] {
            settings
                .entry(field)
                .or_insert_with(|| defaults[field].clone());
        }
    }
    ClientMessage::decode(name, &data)?.with_context(|| format!("Unregistered command {name}"))
}

#[cfg(test)]
pub(crate) fn test_table() -> hanabi_protocol::Table {
    hanabi_protocol::Table {
        game_id: None,
        table_id: TableId(1),
        settings: hanabi_protocol::TableSettings::named("test"),
        owner: hanabi_protocol::UserRef {
            user_id: UserId(1),
            username: "test".into(),
        },
        password_protected: false,
        player_names: vec!["test".into()],
        progress: 0,
        phase: hanabi_protocol::TablePhase::Pregame,
        spectators: vec![],
    }
}
#[cfg(test)]
pub(crate) fn test_welcome() -> hanabi_protocol::Welcome {
    hanabi_protocol::Welcome {
        user_id: UserId(1),
        username: "test".into(),
        muted: false,
        first_time_user: false,
        settings: hanabi_protocol::Settings::default(),
        friends: vec![],
        blocked: vec![],
        playing_at_tables: vec![],
        spectating_at_tables: vec![],
    }
}
/// The part of a game that a client requests as it loads one: first the setup, then the state.
#[derive(Clone, Copy, PartialEq, Eq)]
enum GameInfo {
    Init,
    State,
}

struct Attendance {
    session: Arc<Session>,
    loaded: bool,
    spectator: bool,
    shadow: Option<PlayerIndex>,
    typing_until: Option<Instant>,
}
struct TableActor {
    table: TableSnapshot,
    /// What the database holds for the table.
    saved: Saved,
    retired: bool,
    attendees: HashMap<UserId, Attendance>,
    chat_read: HashMap<UserId, usize>,
    cleanup: Arc<Notify>,
    store: Store,
    hub: mpsc::Sender<HubCommand>,
    anchor: Instant,
    /// When the table may retry timed work that failed.
    timer_retry: Option<Instant>,
    /// Each player's recent table chat. Kept in memory: a restart forgives it.
    chat_limit: crate::accounts::Counter<i32>,
    /// The serialized size of the table's chat, for the players' share of it.
    chat_bytes: chat::ChatBytes,
    /// Whether a variant search is pending. A table runs one at a time.
    discovering: bool,
    _permit: OwnedSemaphorePermit,
    info: Arc<ServerInfo>,
}
