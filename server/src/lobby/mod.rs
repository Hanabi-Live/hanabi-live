//! Actor-independent commands. Apply every `ToSelf` effect only to the caller's
//! captured generation; apply `ToUser` only if its captured generation still lives.
mod chat;
mod history;
mod relationships;
mod settings;
#[cfg(test)]
mod tests;

pub use chat::{
    Classification, GeneralResponse, TableChatCommand, classify_chat, external_command,
    general_response, lobby_history, server_chat,
};
pub use history::{blocked_seeds, get_history, history_ids};
pub use relationships::{block_relations, blocked, blocked_between, friends};
pub use settings::{changed_settings, get_settings, set_setting};

use crate::accounts::{escape_html, normalize_string};
use crate::routing::{Route, route};
use crate::transport::{Identity, Outgoing};
use anyhow::{Result, ensure};
use hanabi_protocol::ClientMessage;
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
    HGroupLevel(u8),
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
    /// Copies a saved lobby message to Discord.
    DiscordMirror {
        chat_id: i32,
        message: String,
    },
    /// A chat command whose reply needs the server's domain or uptime. Public commands are
    /// already persisted; uptime is private and is not.
    RuntimeChat {
        command: String,
        args: Vec<String>,
        room: String,
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
        command: String,
        args: Vec<String>,
    },
}

fn warning(message: &str) -> Effect {
    Effect::to_self(Outgoing::new(
        hanabi_protocol::server::WARNING,
        hanabi_protocol::Warning {
            warning: message.into(),
        },
    ))
}

fn notice(recipient: &str, message: &str, room: &str) -> Effect {
    notice_publication(recipient, message, room).into()
}

/// A server reply that only the user who sent a chat command sees.
pub(crate) fn notice_publication(recipient: &str, message: &str, room: &str) -> Publication {
    Publication::ToSelf(Outgoing::new(
        hanabi_protocol::server::CHAT,
        hanabi_protocol::Chat {
            who: Some("Hanab Live".into()),
            room: Some(room.into()),
            recipient: Some(recipient.into()),
            ..hanabi_protocol::Chat::new(
                message,
                hanabi_protocol::ChatSource::Server,
                crate::model::timestamp(chrono::Utc::now()),
            )
        },
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
    message: ClientMessage,
) -> Result<Option<Vec<Effect>>> {
    ensure!(
        matches!(route(&message), Route::Lobby | Route::TableChat(_)),
        "The lobby does not run {}",
        message.name()
    );
    ensure!(caller.user > UserId(0), "Invalid caller");
    let command = message.name();
    let effects = match message {
        ClientMessage::Setting(request) => {
            let (name, value) = (request.name.as_str(), request.setting.as_str());
            if let Err(error) = settings::validate_setting(name, value) {
                return Ok(Some(vec![warning(&error.to_string())]));
            }
            set_setting(pool, caller.user, name, value).await?;
            match name {
                "hGroupConventions" => vec![Publication::HGroup(value == "true").into()],
                // `validate_setting` has already checked that the level is in range.
                "hGroupLevel" => vec![Publication::HGroupLevel(value.parse()?).into()],
                _ => vec![],
            }
        }
        ClientMessage::Inactive(request) => {
            let inactive = request.inactive;
            vec![
                Publication::Inactive(inactive).into(),
                Effect::broadcast(Outgoing::new(
                    hanabi_protocol::server::USER_INACTIVE,
                    hanabi_protocol::UserInactive {
                        user_id: caller.user,
                        inactive,
                    },
                )),
            ]
        }
        ClientMessage::Chat(request) => {
            return chat::lobby_chat(pool, secret, caller, &request.msg, &request.room, rendered)
                .await;
        }

        ClientMessage::ChatPM(request) => {
            chat::private_message(pool, caller, online, &request.msg, &request.recipient).await?
        }
        ClientMessage::ChatPMHistoryGet(request) => {
            chat::private_history(pool, caller, &request).await?
        }
        ClientMessage::ChatLinked(request) | ClientMessage::ChatBlocked(request) => {
            relationships::relationship(pool, caller, command, "", &request.room).await?
        }
        ClientMessage::ChatFriend(request)
        | ClientMessage::ChatUnfriend(request)
        | ClientMessage::ChatLink(request)
        | ClientMessage::ChatUnlink(request)
        | ClientMessage::ChatBlock(request)
        | ClientMessage::ChatUnblock(request) => {
            relationships::relationship(pool, caller, command, &request.name, &request.room).await?
        }
        ClientMessage::HistoryGet(hanabi_protocol::HistoryRequest { offset, amount }) => {
            if offset < 0 {
                return Ok(Some(vec![warning("That is not a valid start value.")]));
            }
            if amount < 0 {
                return Ok(Some(vec![warning("That is not a valid end value.")]));
            }
            let ids = history_ids(pool, caller.user, offset, amount).await?;
            vec![Effect::to_self(Outgoing::new(
                hanabi_protocol::server::GAME_HISTORY,
                hanabi_protocol::GameHistoryList(get_history(pool, &ids, false).await?),
            ))]
        }
        ClientMessage::HistoryGetSeed(request) => {
            let seed = request.seed.as_str();
            let error = if seed.is_empty() {
                Some("You must provide a seed.")
            } else if !seed.bytes().all(|b| b == b' ' || b.is_ascii_graphic()) {
                Some("Seeds can only contain ASCII characters.")
            } else if !seed.bytes().all(|b| b.is_ascii_alphanumeric() || b == b'-') {
                Some("Seeds can only contain letters, numbers, and hyphens.")
            } else {
                None
            };
            if let Some(error) = error {
                return Ok(Some(vec![warning(error)]));
            }
            let ids: Vec<i32> = sqlx::query_scalar!("SELECT id FROM games WHERE seed=$1", seed)
                .fetch_all(pool)
                .await?;
            let games = get_history(pool, &ids, true).await?;
            let variant_name = games
                .first()
                .map_or_else(|| "n/a".into(), |game| game.options.variant_name.clone());
            vec![Effect::to_self(Outgoing::new(
                hanabi_protocol::server::GAME_HISTORY_OTHER_SCORES,
                hanabi_protocol::GameHistoryOtherScores {
                    games,
                    variant_name,
                    seed: seed.into(),
                },
            ))]
        }
        ClientMessage::TagSearch(request) => {
            let raw = request.msg.as_str();
            if raw.len() > crate::model::MAX_TAG_LENGTH {
                return Ok(Some(vec![warning(&crate::model::tag_too_long())]));
            }
            let replaced: String = raw
                .chars()
                .map(|c| if c.is_whitespace() { ' ' } else { c })
                .collect();
            let trimmed = replaced.trim_matches(' ');
            if trimmed.is_empty() {
                return Ok(Some(vec![warning("Tags cannot be blank.")]));
            }
            let tag = normalize_string(trimmed);
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
                &format!("Games matching \"{}\": {list}", escape_html(&tag)),
                &request.room,
            )]
        }
        _ => unreachable!("the route check admits only lobby commands"),
    };
    Ok(Some(effects))
}
