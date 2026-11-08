//! Actor-independent commands. Apply every `ToSelf` effect only to the caller's
//! captured generation; apply `ToUser` only if its captured generation still lives.
mod chat;
mod history;
mod relationships;
mod settings;
#[cfg(test)]
mod tests;

pub use chat::{
    Classification, GeneralResponse, classify_chat, external_command, general_response,
    lobby_history, server_chat, valid_room,
};
pub use history::{blocked_seeds, get_history, history_ids};
pub use relationships::{block_relations, blocked_between, change_friend, friend_ids, friends};
pub use settings::{get_settings, set_setting};

use crate::accounts::{escape_html, normalize_string};
use crate::transport::Outgoing;
use anyhow::{Result, ensure};
use hanabi_protocol::ClientMessage;

use sqlx::PgPool;

#[derive(Clone, Debug)]
pub struct Caller {
    pub id: i32,
    pub name: String,
    pub normalized_name: String,
    pub ip: String,
    pub generation: u64,
}

#[derive(Clone, Debug)]
pub struct OnlineUser {
    pub id: i32,
    pub name: String,
    pub normalized_name: String,
    pub generation: u64,
}

#[derive(Clone, Debug)]
pub enum Effect {
    ToSelf(Outgoing),
    ToUser {
        id: i32,
        generation: u64,
        message: Outgoing,
    },
    Broadcast(Outgoing),
    Hyphenated(bool),
    Inactive(bool),
    RelationshipChanged {
        user_id: i32,
        target_id: i32,
        added: bool,
    },
    /// Whether any block remains between two users after one of them changed it.
    BlocksChanged {
        user_id: i32,
        target_id: i32,
        blocked: bool,
    },
    DiscordMirror {
        chat_id: i32,
        server: bool,
        message: String,
    },
    /// Runtime-specific replies need the parent's domain or uptime.
    /// Public commands are already persisted; uptime is private and is not.
    RuntimeChat {
        command: String,
        args: Vec<String>,
        room: String,
    },
}

fn warning(message: &str) -> Effect {
    Effect::ToSelf(Outgoing::new(
        hanabi_protocol::server::WARNING,
        hanabi_protocol::Warning {
            warning: message.into(),
        },
    ))
}

pub(crate) fn notice(recipient: &str, message: &str, room: &str) -> Effect {
    Effect::ToSelf(Outgoing::new(
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

/// Check ownership before transferring a parsed payload to this dispatcher.
/// Whether the lobby handles a command. Every command is listed, so a new one needs a decision.
pub fn handles(message: &ClientMessage) -> bool {
    use ClientMessage as M;
    match message {
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
        | M::ChatPlayerInfo(_)
        | M::TagSearch(_)
        | M::Chat(_) => true,
        M::LobbyLoad(_)
        | M::Sync(_)
        | M::ChatRead(_)
        | M::ChatTyping(_)
        | M::TableJoin(_)
        | M::TableLeave(_)
        | M::TableReattend(_)
        | M::TableSetLeader(_)
        | M::TableSetVariant(_)
        | M::TableStart(_)
        | M::TableRestart(_)
        | M::TableSuggest(_)
        | M::TableSpectate(_)
        | M::TableUnattend(_)
        | M::TableTerminate(_)
        | M::TableVoteForTermination(_)
        | M::GetGameInfo1(_)
        | M::GetGameInfo2(_)
        | M::Loaded(_)
        | M::TableCreate(_)
        | M::TableUpdate(_)
        | M::ReplayCreate(_)
        | M::Action(_)
        | M::Pause(_)
        | M::IdleReset(_)
        | M::Note(_)
        | M::Tag(_)
        | M::TagDelete(_)
        | M::TagsDeleteAll(_)
        | M::ReplayAction(_) => false,
    }
}

/// The renderer is a trusted internal Discord renderer, never a client field.
pub async fn dispatch_chat(
    pool: &PgPool,
    secret: &str,
    caller: &Caller,
    message: &str,
    room: &str,
    rendered: Option<&str>,
) -> Result<Option<Vec<Effect>>> {
    chat::lobby_chat(pool, secret, caller, message, room, rendered).await
}

pub async fn dispatch(
    pool: &PgPool,
    secret: &str,
    caller: &Caller,
    online: &[OnlineUser],
    message: ClientMessage,
) -> Result<Option<Vec<Effect>>> {
    if !handles(&message) {
        return Ok(None);
    }
    ensure!(caller.id > 0, "Invalid caller");
    let command = message.name();
    let effects = match message {
        ClientMessage::Setting(request) => {
            let (name, value) = (request.name.as_str(), request.setting.as_str());
            if let Err(error) = settings::validate_setting(name, value) {
                return Ok(Some(vec![warning(&error.to_string())]));
            }
            set_setting(pool, caller.id, name, value).await?;
            if name == "hyphenatedConventions" {
                vec![Effect::Hyphenated(value == "true")]
            } else {
                vec![]
            }
        }
        ClientMessage::Inactive(request) => {
            let inactive = request.inactive;
            vec![
                Effect::Inactive(inactive),
                Effect::Broadcast(Outgoing::new(
                    hanabi_protocol::server::USER_INACTIVE,
                    hanabi_protocol::UserInactive {
                        user_id: hanabi_protocol::UserId(caller.id),
                        inactive,
                    },
                )),
            ]
        }
        ClientMessage::Chat(request) => {
            return chat::lobby_chat(pool, secret, caller, &request.msg, &request.room, None).await;
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
        | ClientMessage::ChatUnblock(request)
        | ClientMessage::ChatPlayerInfo(request) => {
            relationships::relationship(pool, caller, command, &request.name, &request.room).await?
        }
        ClientMessage::HistoryGet(hanabi_protocol::HistoryRequest { offset, amount }) => {
            if offset < 0 {
                return Ok(Some(vec![warning("That is not a valid start value.")]));
            }
            if amount < 0 {
                return Ok(Some(vec![warning("That is not a valid end value.")]));
            }
            let ids = history_ids(pool, caller.id, offset, amount).await?;
            vec![Effect::ToSelf(Outgoing::new(
                hanabi_protocol::server::GAME_HISTORY,
                hanabi_protocol::GameHistoryList(get_history(pool, &ids, false).await?),
            ))]
        }
        ClientMessage::HistoryGetSeed(request) => {
            let seed = request.seed.as_str();
            let error = if seed.is_empty() {
                Some("You must provide a seed.")
            } else if !seed.bytes().all(|b| (32..=126).contains(&b)) {
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
            vec![Effect::ToSelf(Outgoing::new(
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
            if raw.len() > 100 {
                return Ok(Some(vec![warning(
                    "Tags cannot be longer than 100 characters.",
                )]));
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
        _ => unreachable!("handles() admits only lobby commands"),
    };
    Ok(Some(effects))
}
