//! Where each client command runs. Every command is listed, so a new one needs a decision.

use hanabi_protocol::ClientMessage;

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum Route {
    /// The connection reloads its own lobby statistics.
    Connection,
    /// The lobby runs the command against the database. Chat always goes to the lobby first, which
    /// checks it and runs chat commands; a table's chat then continues to `Table`.
    Lobby,
    /// The hub runs the command: a sync, or the creation of a table or replay.
    Hub,
    /// The table with this ID runs the command.
    Table(u64),
}

pub fn route(message: &ClientMessage) -> Route {
    use ClientMessage as M;
    let id = match message {
        M::LobbyLoad(_) => return Route::Connection,
        M::Sync(_) | M::TableCreate(_) | M::ReplayCreate(_) => return Route::Hub,
        M::Setting(_)
        | M::Inactive(_)
        | M::HistoryGet(_)
        | M::HistoryGetSeed(_)
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
        | M::TagSearch(_) => return Route::Lobby,
        // The lobby rejects a room that is neither the lobby nor a table.
        M::Chat(r) => match r.room.strip_prefix("table").and_then(|id| id.parse().ok()) {
            Some(id) => return Route::Table(id),
            None => return Route::Lobby,
        },
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
    };
    Route::Table(id.0)
}
