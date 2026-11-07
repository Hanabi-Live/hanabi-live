//! Actor-independent commands. Apply every ToSelf effect only to the caller's
//! captured generation; apply ToUser only if its captured generation still lives.
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
pub use relationships::{change_friend, friend_ids, friends};
pub use settings::{get_settings, set_setting};

use crate::accounts::{escape_html, normalize_string};
use anyhow::{Result, ensure};
use serde_json::{Value, json};
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
    ToSelf {
        command: String,
        data: Value,
    },
    ToUser {
        id: i32,
        generation: u64,
        command: String,
        data: Value,
    },
    Broadcast {
        command: String,
        data: Value,
    },
    Hyphenated(bool),
    Inactive(bool),
    RelationshipChanged {
        user_id: i32,
        target_id: i32,
        added: bool,
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
    Effect::ToSelf {
        command: "warning".into(),
        data: json!({"warning":message}),
    }
}

pub(crate) fn notice(recipient: &str, message: &str, room: &str) -> Effect {
    Effect::ToSelf {
        command: "chat".into(),
        data: json!(hanabi_protocol::Chat {
            who: Some("Hanab Live".into()),
            room: Some(room.into()),
            recipient: Some(recipient.into()),
            ..hanabi_protocol::Chat::new(
                message,
                hanabi_protocol::ChatSource::Server,
                chat::datetime(chrono::Utc::now())
            )
        }),
    }
}

fn text<'a>(data: &'a Value, key: &str) -> Result<&'a str> {
    data[key]
        .as_str()
        .ok_or_else(|| anyhow::anyhow!("Missing or invalid {key}"))
}

const COMMANDS: &[&str] = &[
    "setting",
    "inactive",
    "historyGet",
    "historyGetSeed",
    "chatPM",
    "chatPMHistoryGet",
    "chatFriend",
    "chatUnfriend",
    "chatLink",
    "chatUnlink",
    "chatLinked",
    "chatPlayerInfo",
    "tagSearch",
    "chat",
];

/// Check ownership before transferring a parsed payload to this dispatcher.
pub fn handles_command(command: &str) -> bool {
    COMMANDS.contains(&command)
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
    command: &str,
    data: Value,
) -> Result<Option<Vec<Effect>>> {
    if !handles_command(command) {
        return Ok(None);
    }
    ensure!(caller.id > 0, "Invalid caller");
    let effects = match command {
        "setting" => {
            let name = text(&data, "name")?;
            let value = text(&data, "setting")?;
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
        "inactive" => {
            let inactive = data["inactive"]
                .as_bool()
                .ok_or_else(|| anyhow::anyhow!("Invalid inactive"))?;
            vec![
                Effect::Inactive(inactive),
                Effect::Broadcast {
                    command: "userInactive".into(),
                    data: json!({"userID":caller.id,"inactive":inactive}),
                },
            ]
        }
        "chat" => {
            let request = hanabi_protocol::decode::<hanabi_protocol::ChatRequest>(&data)?;
            return chat::lobby_chat(pool, secret, caller, &request.msg, &request.room, None).await;
        }

        "chatPM" => {
            let request = hanabi_protocol::decode::<hanabi_protocol::LegacyChatPmRequest>(&data)?;
            chat::private_message(pool, caller, online, &request.msg, &request.recipient).await?
        }
        "chatPMHistoryGet" => {
            let request = hanabi_protocol::decode::<hanabi_protocol::ChatHistoryRequest>(&data)?;
            chat::private_history(pool, caller, &request).await?
        }
        "chatFriend" | "chatUnfriend" | "chatLink" | "chatUnlink" | "chatLinked"
        | "chatPlayerInfo" => {
            relationships::relationship(
                pool,
                caller,
                command,
                data["name"].as_str().unwrap_or(""),
                data["room"].as_str().unwrap_or(""),
            )
            .await?
        }
        "historyGet" => {
            let offset = data["offset"]
                .as_i64()
                .ok_or_else(|| anyhow::anyhow!("Invalid offset"))?;
            let amount = data["amount"]
                .as_i64()
                .ok_or_else(|| anyhow::anyhow!("Invalid amount"))?;
            if offset < 0 {
                return Ok(Some(vec![warning("That is not a valid start value.")]));
            }
            if amount < 0 {
                return Ok(Some(vec![warning("That is not a valid end value.")]));
            }
            let ids = history_ids(pool, caller.id, offset, amount).await?;
            vec![Effect::ToSelf {
                command: "gameHistory".into(),
                data: json!(get_history(pool, &ids, false).await?),
            }]
        }
        "historyGetSeed" => {
            let seed = text(&data, "seed")?;
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
            let variant = games
                .first()
                .map(|game| game["options"]["variantName"].clone())
                .unwrap_or(json!("n/a"));
            vec![Effect::ToSelf {
                command: "gameHistoryOtherScores".into(),
                data: json!({
                    "games":games, "variantName":variant, "seed":seed
                }),
            }]
        }
        "tagSearch" => {
            let raw = text(&data, "msg")?;
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
                data["room"].as_str().unwrap_or(""),
            )]
        }
        _ => unreachable!(),
    };
    Ok(Some(effects))
}
