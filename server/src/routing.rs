//! Where each client command runs. Every command is listed, so a new one needs a decision.

use hanabi_protocol::{
    ChatPmHistoryRequest, ChatPmRequest, ChatRequest, ClientRequest, RelationshipRequest,
    SettingsRequest, TableId, TagSearchRequest, UserInactiveRequest,
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
    Table(TableId),
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

impl<'a> Route<'a> {
    /// The command that the lobby runs for this route, if it runs one.
    pub const fn lobby(self) -> Option<LobbyRequest<'a>> {
        match self {
            Route::Lobby(request) => Some(request),
            Route::TableChat(_, request) => Some(LobbyRequest::Chat(request)),
            Route::Connection | Route::Hub | Route::Table(_) | Route::ClientError => None,
        }
    }
}

pub fn route(message: &ClientRequest) -> Route<'_> {
    use ClientRequest as M;
    use LobbyRequest as L;
    let id = match message {
        M::LobbyLoad(_) => return Route::Connection,
        M::ClientError(_) => return Route::ClientError,
        M::TableCreate(_) | M::ReplayCreate(_) => return Route::Hub,
        M::Settings(r) => return Route::Lobby(L::Settings(r)),
        M::UserInactive(r) => return Route::Lobby(L::UserInactive(r)),
        M::ChatPm(r) => return Route::Lobby(L::ChatPm(r)),
        M::ChatPmHistory(r) => return Route::Lobby(L::ChatPmHistory(r)),
        M::FriendAdd(r) => return Route::Lobby(L::FriendAdd(r)),
        M::FriendRemove(r) => return Route::Lobby(L::FriendRemove(r)),
        M::LinkAdd(r) => return Route::Lobby(L::LinkAdd(r)),
        M::LinkRemove(r) => return Route::Lobby(L::LinkRemove(r)),
        M::LinkList(_) => return Route::Lobby(L::LinkList),
        M::BlockAdd(r) => return Route::Lobby(L::BlockAdd(r)),
        M::BlockRemove(r) => return Route::Lobby(L::BlockRemove(r)),
        M::TagSearch(r) => return Route::Lobby(L::TagSearch(r)),
        M::Chat(r) => match r.table_id {
            Some(id) => return Route::TableChat(id, r),
            None => return Route::Lobby(L::Chat(r)),
        },
        M::ChatRead(r)
        | M::ChatTyping(r)
        | M::TableLeave(r)
        | M::TableReattend(r)
        | M::IdleReset(r)
        | M::TableUnattend(r)
        | M::TableTerminate(r)
        | M::GameInitLoad(r)
        | M::GameStateLoad(r)
        | M::TagRemoveAll(r)
        | M::GameLoaded(r) => r.table_id,
        M::TableJoin(r) => r.table_id,
        M::TableTerminateVote(r) => r.table_id,
        M::TableSetOwner(r) => r.table_id,
        M::TableStart(r) => r.table_id,
        M::TableRestart(r) => r.table_id,
        M::TableRestartDecline(r) => r.table_id,
        M::TableSuggest(r) => r.table_id,
        M::TableSpectate(r) => r.table_id,
        M::TableUpdate(r) => r.table_id,
        M::PlayerAction(r) => r.table_id,
        M::Pause(r) => r.table_id,
        M::PauseQueue(r) => r.table_id,
        M::Note(r) => r.table_id,
        M::TagAdd(r) | M::TagRemove(r) => r.table_id,
        M::ReplayAction(r) => r.table_id,
    };
    Route::Table(id)
}
