//! Where each client command runs. Every command is listed, so a new one needs a decision.

use hanabi_protocol::{
    ChatPmHistoryRequest, ChatPmRequest, ChatRequest, ClientRequest, NoteRequest,
    PauseQueueRequest, PauseRequest, PlayerActionRequest, RelationshipRequest, ReplayAction,
    SettingsRequest, TableId, TableRestartDeclineRequest, TableSetOwnerRequest,
    TableSpectateRequest, TableStartRequest, TableSuggestRequest, TableTerminateVoteRequest,
    TableUpdateRequest, TagRequest, TagSearchRequest, UserInactiveRequest,
};

#[derive(Clone, Copy, Debug)]
pub enum Route<'a> {
    /// The connection reloads its own lobby statistics.
    Connection,
    /// The lobby runs the command against the database. This includes the lobby's chat.
    Lobby(LobbyRequest<'a>),
    /// A table's chat. The lobby checks it and runs chat commands first, then the rest continues to
    /// the table with this ID.
    TableChat(TableId, &'a ChatRequest),
    /// The hub runs the command: the creation of a table or replay.
    Hub,
    /// The table with this ID runs the command.
    Table(TableId, TableRequest<'a>),
    /// The connection logs a client error and alerts about it.
    ClientError,
}

/// A command that the lobby runs, borrowed from its client request.
#[derive(Clone, Copy, Debug)]
pub enum LobbyRequest<'a> {
    Settings(&'a SettingsRequest),
    UserInactive(&'a UserInactiveRequest),
    /// The lobby's chat, or a table's chat that the lobby checks first.
    Chat(&'a ChatRequest),
    ChatPm(&'a ChatPmRequest),
    ChatPmHistory(&'a ChatPmHistoryRequest),
    FriendAdd(&'a RelationshipRequest),
    FriendRemove(&'a RelationshipRequest),
    LinkAdd(&'a RelationshipRequest),
    LinkRemove(&'a RelationshipRequest),
    LinkList,
    BlockAdd(&'a RelationshipRequest),
    BlockRemove(&'a RelationshipRequest),
    TagSearch(&'a TagSearchRequest),
}

/// A command that a table runs, borrowed from its client request.
#[derive(Clone, Copy, Debug)]
pub enum TableRequest<'a> {
    /// A join that starts its password check in the table's `client` first.
    TableJoin,
    TableReattend,
    TableSpectate(&'a TableSpectateRequest),
    TableUnattend,
    TableLeave,
    TableSetOwner(&'a TableSetOwnerRequest),
    GameInitLoad,
    GameStateLoad,
    GameLoaded,
    /// A table's chat, after the lobby ran its chat commands.
    Chat(&'a ChatRequest),
    ChatRead,
    ChatTyping,
    /// A command whose result depends on the table's phase.
    Phase(PhaseRequest<'a>),
}

/// A table command whose result depends on the table's phase. Each phase lists every one, so that a
/// new command needs a decision in each phase.
#[derive(Clone, Copy, Debug)]
pub enum PhaseRequest<'a> {
    TableStart(&'a TableStartRequest),
    TableUpdate(&'a TableUpdateRequest),
    TableTerminate,
    TableTerminateVote(&'a TableTerminateVoteRequest),
    PlayerAction(&'a PlayerActionRequest),
    Pause(&'a PauseRequest),
    PauseQueue(&'a PauseQueueRequest),
    IdleReset,
    Note(&'a NoteRequest),
    Tag(TagChange<'a>),
    ReplayAction(&'a ReplayAction),
    TableSuggest(&'a TableSuggestRequest),
    /// A restart, which starts in the table's `client` with its statistics.
    TableRestart,
    TableRestartDecline(&'a TableRestartDeclineRequest),
}

/// A change to a game's tags.
#[derive(Clone, Copy, Debug)]
pub enum TagChange<'a> {
    Add(&'a TagRequest),
    Remove(&'a TagRequest),
    RemoveAll,
}

impl<'a> Route<'a> {
    /// The command that the lobby runs for this route, if it runs one.
    pub const fn lobby(self) -> Option<LobbyRequest<'a>> {
        match self {
            Route::Lobby(request) => Some(request),
            Route::TableChat(_, request) => Some(LobbyRequest::Chat(request)),
            Route::Connection | Route::Hub | Route::Table(..) | Route::ClientError => None,
        }
    }

    /// The table that runs this route's command, and the command, if a table runs one.
    pub const fn table(self) -> Option<(TableId, TableRequest<'a>)> {
        match self {
            Route::Table(id, request) => Some((id, request)),
            Route::TableChat(id, request) => Some((id, TableRequest::Chat(request))),
            Route::Connection | Route::Hub | Route::Lobby(_) | Route::ClientError => None,
        }
    }
}

pub fn route(message: &ClientRequest) -> Route<'_> {
    use ClientRequest as M;
    use LobbyRequest as L;
    use PhaseRequest as P;
    use TableRequest as T;
    match message {
        M::LobbyLoad(_) => Route::Connection,
        M::ClientError(_) => Route::ClientError,
        M::TableCreate(_) | M::ReplayCreate(_) => Route::Hub,
        M::Settings(r) => Route::Lobby(L::Settings(r)),
        M::UserInactive(r) => Route::Lobby(L::UserInactive(r)),
        M::ChatPm(r) => Route::Lobby(L::ChatPm(r)),
        M::ChatPmHistory(r) => Route::Lobby(L::ChatPmHistory(r)),
        M::FriendAdd(r) => Route::Lobby(L::FriendAdd(r)),
        M::FriendRemove(r) => Route::Lobby(L::FriendRemove(r)),
        M::LinkAdd(r) => Route::Lobby(L::LinkAdd(r)),
        M::LinkRemove(r) => Route::Lobby(L::LinkRemove(r)),
        M::LinkList(_) => Route::Lobby(L::LinkList),
        M::BlockAdd(r) => Route::Lobby(L::BlockAdd(r)),
        M::BlockRemove(r) => Route::Lobby(L::BlockRemove(r)),
        M::TagSearch(r) => Route::Lobby(L::TagSearch(r)),
        M::Chat(r) => match r.table_id {
            Some(id) => Route::TableChat(id, r),
            None => Route::Lobby(L::Chat(r)),
        },
        M::TableJoin(r) => Route::Table(r.table_id, T::TableJoin),
        M::TableReattend(r) => Route::Table(r.table_id, T::TableReattend),
        M::TableSpectate(r) => Route::Table(r.table_id, T::TableSpectate(r)),
        M::TableUnattend(r) => Route::Table(r.table_id, T::TableUnattend),
        M::TableLeave(r) => Route::Table(r.table_id, T::TableLeave),
        M::TableSetOwner(r) => Route::Table(r.table_id, T::TableSetOwner(r)),
        M::GameInitLoad(r) => Route::Table(r.table_id, T::GameInitLoad),
        M::GameStateLoad(r) => Route::Table(r.table_id, T::GameStateLoad),
        M::GameLoaded(r) => Route::Table(r.table_id, T::GameLoaded),
        M::ChatRead(r) => Route::Table(r.table_id, T::ChatRead),
        M::ChatTyping(r) => Route::Table(r.table_id, T::ChatTyping),
        M::TableStart(r) => Route::Table(r.table_id, T::Phase(P::TableStart(r))),
        M::TableUpdate(r) => Route::Table(r.table_id, T::Phase(P::TableUpdate(r))),
        M::TableTerminate(r) => Route::Table(r.table_id, T::Phase(P::TableTerminate)),
        M::TableTerminateVote(r) => Route::Table(r.table_id, T::Phase(P::TableTerminateVote(r))),
        M::PlayerAction(r) => Route::Table(r.table_id, T::Phase(P::PlayerAction(r))),
        M::Pause(r) => Route::Table(r.table_id, T::Phase(P::Pause(r))),
        M::PauseQueue(r) => Route::Table(r.table_id, T::Phase(P::PauseQueue(r))),
        M::IdleReset(r) => Route::Table(r.table_id, T::Phase(P::IdleReset)),
        M::Note(r) => Route::Table(r.table_id, T::Phase(P::Note(r))),
        M::TagAdd(r) => Route::Table(r.table_id, T::Phase(P::Tag(TagChange::Add(r)))),
        M::TagRemove(r) => Route::Table(r.table_id, T::Phase(P::Tag(TagChange::Remove(r)))),
        M::TagRemoveAll(r) => Route::Table(r.table_id, T::Phase(P::Tag(TagChange::RemoveAll))),
        M::ReplayAction(r) => Route::Table(r.table_id, T::Phase(P::ReplayAction(r))),
        M::TableSuggest(r) => Route::Table(r.table_id, T::Phase(P::TableSuggest(r))),
        M::TableRestart(r) => Route::Table(r.table_id, T::Phase(P::TableRestart)),
        M::TableRestartDecline(r) => Route::Table(r.table_id, T::Phase(P::TableRestartDecline(r))),
    }
}
