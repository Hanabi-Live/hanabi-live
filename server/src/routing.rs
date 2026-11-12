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
        M::Settings(_)
        | M::UserInactive(_)
        | M::GameHistory(_)
        | M::SeedGames(_)
        | M::ChatPm(_)
        | M::ChatPmHistory(_)
        | M::FriendAdd(_)
        | M::FriendRemove(_)
        | M::LinkAdd(_)
        | M::LinkRemove(_)
        | M::LinkList(_)
        | M::BlockAdd(_)
        | M::BlockRemove(_)
        | M::BlockList(_)
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
        | M::TableTerminateVote(r)
        | M::GameInitLoad(r)
        | M::GameStateLoad(r)
        | M::TagRemoveAll(r)
        | M::Loaded(r) => r.table_id,
        M::TableJoin(r) => r.table_id,
        M::TableSetOwner(r) => r.table_id,
        M::TableStart(r) => r.table_id,
        M::TableRestart(r) => r.table_id,
        M::TableRestartDecline(r) => r.table_id,
        M::TableSuggest(r) => r.table_id,
        M::TableSpectate(r) => r.table_id,
        M::TableUpdate(r) => r.table_id,
        M::PlayerAction(r) => r.table_id,
        M::Pause(r) => r.table_id,
        M::Note(r) => r.table_id,
        M::TagAdd(r) | M::TagRemove(r) => r.table_id,
        M::ReplayAction(r) => r.table_id,
    };
    Route::Table(id)
}
