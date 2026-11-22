//! Actor-independent commands. Apply every `ToSelf` effect only to the caller's
//! captured generation; apply `ToUser` only if its captured generation still lives.
mod chat;
mod relationships;
mod seeds;
mod settings;
#[cfg(test)]
mod tests;

#[cfg(test)]
pub use chat::LOBBY_CHAT_LIMIT;
pub use chat::{
    ChatCommand, Classification, CommandKind, GeneralResponse, LobbyChatLimit, RuntimeCommand,
    TableChatCommand, classify_chat, external_command, lobby_history, server_chat, too_quickly,
};
use relationships::Change;
pub use relationships::{block_relations, blocked, blocked_between, friends};
pub use seeds::blocked_seeds;
pub use settings::get_settings;
use settings::set_settings;

use crate::routing::{LobbyRequest, route};
use crate::transport::{Identity, Outgoing};
use anyhow::{Context, Result, ensure};
use hanabi_protocol::ClientRequest;
use hanabi_protocol::UserId;
use std::sync::Arc;

use sqlx::PgPool;

/// A connected user, as private messages find them.
#[derive(Clone, Debug)]
pub struct OnlineUser {
    pub identity: Arc<Identity>,
    pub generation: u64,
}

/// A change that the hub makes for a lobby command: a message to send, or an update to a connected
/// user's session.
#[derive(Clone, Debug)]
pub enum Publication {
    ToSelf(Outgoing),
    ToUser {
        id: UserId,
        generation: u64,
        message: Outgoing,
    },
    Broadcast(Outgoing),
    HGroup(bool),
    HGroupLevel(Option<hanabi_protocol::HGroupLevel>),
    Inactive(bool),
    /// Whether any block remains between two users after one of them changed it.
    BlocksChanged {
        user_id: UserId,
        target_id: UserId,
        blocked: bool,
    },
}

/// What a lobby command asks for once it has run. The web layer does the work that needs the
/// server's runtime or integrations, and the hub publishes the rest.
#[derive(Clone, Debug)]
pub enum Effect {
    Publish(Publication),
    /// The data of the reply to the command.
    Reply(hanabi_protocol::ReplyData),
    /// Copies a saved lobby message to Discord.
    DiscordMirror {
        chat_id: i32,
        message: String,
    },
    /// A chat command whose reply needs the server's domain or uptime. Public commands are
    /// already persisted; uptime is private and is not.
    RuntimeChat {
        command: RuntimeCommand,
        args: Vec<String>,
    },
}

impl From<Publication> for Effect {
    fn from(publication: Publication) -> Self {
        Self::Publish(publication)
    }
}

impl Effect {
    /// A message to the user who sent the command.
    pub fn to_self(message: Outgoing) -> Self {
        Publication::ToSelf(message).into()
    }
    /// A message to everyone in the lobby.
    pub fn broadcast(message: Outgoing) -> Self {
        Publication::Broadcast(message).into()
    }
}

/// A server message saved to the lobby chat.
#[derive(Clone, Debug)]
pub struct SavedChat {
    pub chat_id: i32,
    /// The chat message for everyone in the lobby.
    pub broadcast: Outgoing,
    /// The message as it was saved, for Discord.
    pub message: String,
}

/// The reply to a public chat command from Discord.
#[derive(Debug)]
pub enum ExternalReply {
    Saved(SavedChat),
    /// The reply needs the server's runtime information.
    Runtime {
        command: RuntimeCommand,
        args: Vec<String>,
    },
}

/// Refuses a lobby command. The player sees the message, which is plain text.
fn refused<T>(message: impl Into<String>) -> Result<T> {
    Err(crate::errors::CommandError::rejected(message).into())
}

fn notice(recipient: &str, message: &str) -> Effect {
    notice_publication(recipient, message).into()
}

/// A server reply that only the user who sent a chat command sees. It names no table, so the
/// client shows it in the chat that the user has open.
pub(crate) fn notice_publication(recipient: &str, message: &str) -> Publication {
    Publication::ToSelf(Outgoing::new(
        hanabi_protocol::event::CHAT,
        hanabi_protocol::Chat::from(hanabi_protocol::ChatMessage::private(
            message,
            hanabi_protocol::ChatAuthor::Server {},
            recipient,
            hanabi_protocol::Timestamp::from(time::OffsetDateTime::now_utc()),
        )),
    ))
}

/// Runs a command that `route` sends to the lobby: a `Route::Lobby` command, or a table's chat.
/// `online` lists the online users, which only a private message needs. `rendered` is a lobby
/// message as Discord shows it. Returns `None` for a table's chat that continues to its table.
pub async fn dispatch(
    pool: &PgPool,
    secret: &str,
    caller: &Identity,
    online: &[OnlineUser],
    rendered: Option<&str>,
    message: ClientRequest,
) -> Result<Option<Vec<Effect>>> {
    let request = route(&message)
        .lobby()
        .with_context(|| format!("The lobby does not run {}", message.name()))?;
    ensure!(caller.user.get() > 0, "Invalid caller");
    let effects = match request {
        LobbyRequest::Settings(request) => {
            set_settings(pool, caller.user, &request.settings, &request.cleared).await?;
            let mut effects = vec![];
            if let Some(conventions) = request.settings.h_group_conventions {
                effects.push(Publication::HGroup(conventions).into());
            }
            if let Some(level) = request.settings.h_group_level {
                effects.push(Publication::HGroupLevel(Some(level)).into());
            }
            for setting in &request.cleared {
                match setting {
                    hanabi_protocol::OptionalSetting::HGroupLevel => {
                        effects.push(Publication::HGroupLevel(None).into());
                    }
                }
            }
            effects
        }
        LobbyRequest::UserInactive(request) => {
            vec![Publication::Inactive(request.inactive).into()]
        }
        LobbyRequest::Chat(request) => {
            return chat::lobby_chat(
                pool,
                secret,
                caller,
                &request.text,
                request.table_id,
                rendered,
            )
            .await;
        }

        LobbyRequest::ChatPm(request) => {
            chat::private_message(pool, caller, online, &request.text, &request.recipient).await?
        }
        LobbyRequest::ChatPmHistory(request) => {
            chat::private_history(pool, caller, request).await?
        }
        LobbyRequest::LinkList => relationships::linked_list(pool, caller).await?,
        LobbyRequest::FriendAdd(request) => {
            relationships::relationship(pool, caller, Change::Friend, &request.username).await?
        }
        LobbyRequest::FriendRemove(request) => {
            relationships::relationship(pool, caller, Change::Unfriend, &request.username).await?
        }
        LobbyRequest::LinkAdd(request) => {
            relationships::relationship(pool, caller, Change::Link, &request.username).await?
        }
        LobbyRequest::LinkRemove(request) => {
            relationships::relationship(pool, caller, Change::Unlink, &request.username).await?
        }
        LobbyRequest::BlockAdd(request) => {
            relationships::relationship(pool, caller, Change::Block, &request.username).await?
        }
        LobbyRequest::BlockRemove(request) => {
            relationships::relationship(pool, caller, Change::Unblock, &request.username).await?
        }
        LobbyRequest::TagSearch(request) => {
            let tag = match crate::model::normalize_tag(request.tag.as_str()) {
                Ok(tag) => tag,
                Err(message) => return refused(message),
            };
            let ids: Vec<i32> = sqlx::query_scalar!(
                "SELECT DISTINCT game_id FROM game_tags WHERE tag=$1 ORDER BY game_id",
                &tag
            )
            .fetch_all(pool)
            .await?;
            let list = ids
                .iter()
                .map(i32::to_string)
                .collect::<Vec<_>>()
                .join(", ");
            vec![notice(
                &caller.name,
                &format!("Games matching \"{tag}\": {list}"),
            )]
        }
    };
    Ok(Some(effects))
}
