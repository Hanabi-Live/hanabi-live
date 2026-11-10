//! Where each client command runs. Every command is listed, so a new one needs a decision.

use hanabi_protocol::ClientMessage;
use hanabi_protocol::TableId;

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum Route {
    /// The connection reloads its own lobby statistics.
    Connection,
    /// The lobby runs the command against the database. This includes the lobby's chat.
    Lobby,
    /// A table's chat. The lobby checks it and runs chat commands first, then the rest continues to
    /// the table with this ID.
    TableChat(TableId),
    /// The hub runs the command: a sync, or the creation of a table or replay.
    Hub,
    /// The table with this ID runs the command.
    Table(TableId),
}

pub fn route(message: &ClientMessage) -> Route {
    use ClientMessage as M;
    let id = match message {
        M::LobbyLoad(_) => return Route::Connection,
        M::Sync(_) | M::TableCreate(_) | M::ReplayCreate(_) => return Route::Hub,
        M::Setting(_)
        | M::Inactive(_)
        | M::GameHistory(_)
        | M::GameHistoryOtherScores(_)
        | M::ChatPM(_)
        | M::ChatPMHistory(_)
        | M::ChatFriend(_)
        | M::ChatUnfriend(_)
        | M::ChatLink(_)
        | M::ChatUnlink(_)
        | M::ChatLinked(_)
        | M::ChatBlock(_)
        | M::ChatUnblock(_)
        | M::ChatBlocked(_)
        | M::TagSearch(_) => return Route::Lobby,
        M::Chat(r) => match r.table_id {
            Some(id) => return Route::TableChat(id),
            None => return Route::Lobby,
        },
        M::ChatRead(r)
        | M::ChatTyping(r)
        | M::TableLeave(r)
        | M::TableReattend(r)
        | M::IdleReset(r)
        | M::TableUnattend(r)
        | M::TableTerminate(r)
        | M::TableVoteForTermination(r)
        | M::GetGameInit(r)
        | M::GetGameState(r)
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
    };
    Route::Table(id)
}
