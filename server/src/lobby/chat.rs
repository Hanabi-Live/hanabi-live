use super::{Effect, ExternalReply, OnlineUser, Publication, SavedChat, notice, warning};
use crate::accounts::{escape_html, is_muted, normalize_chat, normalize_string, regenerate_token};
use crate::transport::{Identity, Outgoing};
use anyhow::{Context, Result, ensure};
use chrono::SecondsFormat;
use hanabi_protocol::{Chat, ChatPmHistory, ChatPmHistoryRequest, ChatSource, TableId};
use serde::Deserialize;
use sqlx::PgPool;
use std::sync::LazyLock;

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct SimpleResponse {
    command: String,
    response: String,
    #[serde(default)]
    alias: Vec<String>,
    #[serde(default)]
    private: bool,
    #[serde(default)]
    is_help: bool,
}

static RESPONSES: LazyLock<Vec<SimpleResponse>> = LazyLock::new(|| {
    serde_json::from_str(include_str!(
        "../../../packages/data/src/json/chatReplyCommands.json"
    ))
    .expect("the chat reply commands are valid JSON")
});

const WEBSITE: &[&str] = &[
    "block",
    "blocked",
    "f",
    "friend",
    "friends",
    "link",
    "linked",
    "msg",
    "pm",
    "terminate",
    "unblock",
    "unfriend",
    "unlink",
    "version",
    "w",
    "whisper",
];
/// A chat command that runs at a table rather than in the lobby.
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum TableChatCommand {
    MissingScores,
    FindVariant,
    Suggest,
    Tags,
    Split { automatic: bool },
    Kick,
    Impostor,
}

/// The names of the table chat commands.
const TABLE_COMMANDS: &[(&str, TableChatCommand)] = &[
    ("m", TableChatCommand::MissingScores),
    ("missing", TableChatCommand::MissingScores),
    ("missing-scores", TableChatCommand::MissingScores),
    ("missingscores", TableChatCommand::MissingScores),
    ("shared-missing-scores", TableChatCommand::MissingScores),
    ("sharedmissingscores", TableChatCommand::MissingScores),
    ("find-variant", TableChatCommand::FindVariant),
    ("findvariant", TableChatCommand::FindVariant),
    ("fv", TableChatCommand::FindVariant),
    ("random-variant", TableChatCommand::FindVariant),
    ("randomvariant", TableChatCommand::FindVariant),
    ("suggest", TableChatCommand::Suggest),
    ("taglist", TableChatCommand::Tags),
    ("tags", TableChatCommand::Tags),
    ("sa", TableChatCommand::Split { automatic: true }),
    ("split", TableChatCommand::Split { automatic: false }),
    ("splitauto", TableChatCommand::Split { automatic: true }),
    ("kick", TableChatCommand::Kick),
    ("impostor", TableChatCommand::Impostor),
];

impl TableChatCommand {
    /// Reads a lowercase command name without its slash.
    pub fn parse(command: &str) -> Option<Self> {
        TABLE_COMMANDS
            .iter()
            .find(|(name, _)| *name == command)
            .map(|(_, parsed)| *parsed)
    }
}

/// Whether a command runs at a table rather than in the lobby.
fn delegated(command: &str) -> bool {
    TableChatCommand::parse(command).is_some()
}

fn parsed(message: &str) -> Option<(String, Vec<&str>)> {
    let mut parts = message.split(' ');
    let first = parts.next()?.strip_prefix('/')?;
    if first.is_empty() {
        return None;
    }
    Some((first.to_lowercase(), parts.collect()))
}

fn simple(command: &str) -> Option<&'static SimpleResponse> {
    RESPONSES
        .iter()
        .find(|r| r.command == command || r.alias.iter().any(|a| a == command))
}

#[derive(Clone, Copy, PartialEq, Eq)]
pub enum Classification {
    Text,
    Public,
    Private,
    Unknown,
}

pub enum GeneralResponse {
    Public(String),
    Private(String),
    Runtime { command: String, args: Vec<String> },
}

pub fn general_response(message: &str) -> Option<GeneralResponse> {
    let (command, args) = parsed(message)?;
    if let Some(response) = simple(&command) {
        let content = if response.is_help {
            format!(
                "<br>List of commands:<br>{}<br>{}",
                help(),
                response.response
            )
        } else {
            response.response.clone()
        };
        return Some(if response.private {
            GeneralResponse::Private(content)
        } else {
            GeneralResponse::Public(content)
        });
    }
    if WEBSITE.contains(&command.as_str()) {
        return Some(GeneralResponse::Public(
            "You cannot perform that command from Discord; please use the website instead.".into(),
        ));
    }
    if command == "random" {
        return Some(GeneralResponse::Public(random_response(&args)));
    }
    if command == "replay" {
        return Some(GeneralResponse::Runtime {
            command,
            args: args.iter().map(|arg| (*arg).into()).collect(),
        });
    }
    None
}

pub fn classify_chat(message: &str) -> Classification {
    let Some((command, _)) = parsed(message) else {
        return Classification::Text;
    };
    if matches!(command.as_str(), "token" | "uptime") || simple(&command).is_some_and(|r| r.private)
    {
        return Classification::Private;
    }
    if simple(&command).is_some()
        || WEBSITE.contains(&command.as_str())
        || delegated(&command)
        || ["random", "replay"].contains(&command.as_str())
    {
        Classification::Public
    } else {
        Classification::Unknown
    }
}

pub async fn external_command(pool: &PgPool, message: &str) -> Result<Option<ExternalReply>> {
    let Some((command, args)) = parsed(message) else {
        return Ok(None);
    };
    if classify_chat(message) != Classification::Public {
        return Ok(None);
    }
    let response = if let Some(response) = simple(&command) {
        response.response.clone()
    } else if WEBSITE.contains(&command.as_str()) {
        "You cannot perform that command from Discord; please use the website instead.".into()
    } else if command == "random" {
        random_response(&args)
    } else if command == "replay" {
        return Ok(Some(ExternalReply::Runtime {
            command,
            args: args.iter().map(|s| (*s).into()).collect(),
        }));
    } else {
        "You can only perform this command while in a game.".into()
    };
    Ok(Some(ExternalReply::Saved(
        server_chat(pool, &response).await?,
    )))
}

fn help() -> String {
    let mut names: Vec<_> = WEBSITE
        .iter()
        .chain(TABLE_COMMANDS.iter().map(|(name, _)| name))
        .chain(["random", "replay", "uptime", "token"].iter())
        .map(|s| format!("/{s}"))
        .collect();
    names.extend(RESPONSES.iter().map(|r| format!("/{}", r.command)));
    names.sort();
    names.dedup();
    names.join(", ").replace('-', "&#8209;")
}

fn random_response(args: &[&str]) -> String {
    if args.is_empty() || args.len() > 2 {
        return "The format of the /random command is: /random [min] [max]".into();
    }
    let mut numbers = Vec::new();
    for arg in args {
        match arg.parse::<i64>() {
            Ok(value) => numbers.push(value),
            Err(_) => {
                return if arg.parse::<f64>().is_ok() {
                    "The /random command only accepts integers.".into()
                } else {
                    format!("\"{}\" is not an integer.", escape_html(arg))
                };
            }
        }
    }
    let (min, max) = if numbers.len() == 1 {
        (1, numbers[0])
    } else {
        (numbers[0], numbers[1])
    };
    if min >= max {
        return format!("{min} is greater than or equal to {max}, so that request is nonsensical.");
    }
    let number = rand::random_range(min..=max);
    format!("Random number between {min} and {max}: {number}")
}

pub async fn private_message(
    pool: &PgPool,
    caller: &Identity,
    online: &[OnlineUser],
    message: &str,
    recipient: &str,
) -> Result<Vec<Effect>> {
    if is_muted(pool, &caller.ip).await? {
        return Ok(vec![warning("You have been muted by an administrator.")]);
    }
    let message = match normalize_chat(message) {
        Ok(message) => message,
        Err(error) => return Ok(vec![warning(&error)]),
    };
    let recipient = match normalize_chat(recipient) {
        Ok(recipient) => recipient,
        Err(error) => return Ok(vec![warning(&error)]),
    };
    let normalized = normalize_string(&recipient);
    if normalized == caller.normalized_name {
        return Ok(vec![warning(
            "You cannot send a private message to yourself.",
        )]);
    }
    let Some(target) = online
        .iter()
        .find(|u| u.identity.normalized_name == normalized)
    else {
        return Ok(vec![warning(&format!(
            "User \"{}\" is not currently online.",
            escape_html(&recipient)
        ))]);
    };
    if super::blocked_between(pool, caller.user, &[target.identity.user]).await? {
        return Ok(vec![warning(&format!(
            "You cannot send a private message to \"{}\".",
            escape_html(&target.identity.name)
        ))]);
    }
    let message = escape_html(&message);
    let row = sqlx::query!(
        "INSERT INTO chat_log_pm(user_id,recipient_id,message) VALUES($1,$2,$3)
         RETURNING id, datetime_sent",
        caller.user.0,
        target.identity.user.0,
        &message
    )
    .fetch_one(pool)
    .await?;
    let data = Chat {
        username: Some(caller.name.clone().into()),
        recipient: Some(target.identity.name.clone().into()),
        ..Chat::new(
            message,
            ChatSource::User,
            hanabi_protocol::Timestamp::from(row.datetime_sent),
        )
    };
    Ok(vec![
        Effect::to_self(Outgoing::new(hanabi_protocol::server::CHAT, data.clone())),
        Publication::ToUser {
            id: target.identity.user,
            generation: target.generation,
            message: Outgoing::new(hanabi_protocol::server::CHAT, data),
        }
        .into(),
    ])
}

pub async fn private_history(
    pool: &PgPool,
    caller: &Identity,
    data: &ChatPmHistoryRequest,
) -> Result<Vec<Effect>> {
    let amount = data.limit.get();
    let peer: Option<i32> = if let Some(username) = data.recipient.as_deref() {
        let found = sqlx::query_scalar!(
            "SELECT id FROM users WHERE normalized_username=$1",
            normalize_string(username)
        )
        .fetch_optional(pool)
        .await?;
        if found.is_none() {
            return Ok(vec![warning(&format!(
                "User \"{}\" does not exist.",
                escape_html(username)
            ))]);
        }
        found
    } else {
        None
    };
    let rows = sqlx::query!(
        "SELECT c.message, c.datetime_sent,
         COALESCE(u.username, 'Deleted user #' || c.user_id) AS who,
         COALESCE(r.username, 'Deleted user #' || c.recipient_id) AS recipient
         FROM chat_log_pm c LEFT JOIN users u ON u.id=c.user_id
         LEFT JOIN users r ON r.id=c.recipient_id
         WHERE (c.user_id=$1 OR c.recipient_id=$1)
           AND ($2::int IS NULL OR (c.user_id=$1 AND c.recipient_id=$2)
                OR (c.user_id=$2 AND c.recipient_id=$1))
         ORDER BY c.id DESC LIMIT $3",
        caller.user.0,
        peer,
        amount
    )
    .fetch_all(pool)
    .await?;
    let mut list = Vec::new();
    for row in rows.iter().rev() {
        list.push(Chat {
            username: Some(
                row.who
                    .clone()
                    .context("Missing private message author")?
                    .into(),
            ),
            recipient: Some(
                row.recipient
                    .clone()
                    .context("Missing private message recipient")?
                    .into(),
            ),
            ..Chat::new(
                row.message.clone(),
                ChatSource::User,
                hanabi_protocol::Timestamp::from(row.datetime_sent),
            )
        });
    }
    let response = ChatPmHistory {
        messages: list,
        table_id: data.table_id,
    };
    Ok(vec![Effect::to_self(Outgoing::new(
        hanabi_protocol::server::CHAT_PM_HISTORY,
        response,
    ))])
}

/// Returns None for table chat and table/replay-owned commands. Never persists
/// those messages here. Private runtime commands are intercepted before delegation.
pub async fn lobby_chat(
    pool: &PgPool,
    secret: &str,
    caller: &Identity,
    message: &str,
    table: Option<TableId>,
    rendered: Option<&str>,
) -> Result<Option<Vec<Effect>>> {
    if is_muted(pool, &caller.ip).await? {
        return Ok(Some(vec![warning(
            "You have been muted by an administrator.",
        )]));
    }
    let message = match normalize_chat(message) {
        Ok(message) => message,
        Err(error) => return Ok(Some(vec![warning(&error)])),
    };
    let command = parsed(&message);
    if let Some((command, args)) = &command
        && command == "token"
    {
        let response = if args.iter().any(|arg| !arg.is_empty()) {
            "The format of the /token command is: /token".into()
        } else {
            let token = regenerate_token(pool, secret, caller.user.0, &caller.ip).await?;
            format!(
                "Identity token (valid until {} UTC): <code>{}</code>",
                token.expires_at.to_rfc3339_opts(SecondsFormat::Secs, true),
                token.token
            )
        };
        return Ok(Some(vec![notice(&caller.name, &response, table)]));
    }
    if let Some((command, args)) = &command
        && command == "uptime"
    {
        return Ok(Some(vec![Effect::RuntimeChat {
            command: command.clone(),
            args: args.iter().map(|arg| (*arg).into()).collect(),
            table,
        }]));
    }
    if table.is_some() {
        return Ok(None);
    }
    let mut private_response = None;
    let mut public_response = None;
    let mut runtime = None;
    if let Some((command, args)) = &command {
        if delegated(command) {
            public_response = Some("You can only perform this command while in a game.".into());
        } else if let Some(response) = simple(command) {
            let content = if response.is_help {
                format!(
                    "<br>List of commands:<br>{}<br>{}",
                    help(),
                    response.response
                )
            } else {
                response.response.clone()
            };
            if response.private {
                private_response = Some(content);
            } else {
                public_response = Some(content);
            }
        } else if WEBSITE.contains(&command.as_str()) {
            public_response = Some(
                "You cannot perform that command from Discord; please use the website instead."
                    .into(),
            );
        } else if command == "random" {
            public_response = Some(random_response(args));
        } else if command == "replay" {
            runtime = Some(Effect::RuntimeChat {
                command: command.clone(),
                args: args.iter().map(|s| (*s).to_owned()).collect(),
                table,
            });
        } else {
            return Ok(Some(vec![notice(
                &caller.name,
                &format!(
                    "The chat command of <code>/{}</code> is not valid. Use <code>/help</code> to get a list of available commands.",
                    escape_html(command)
                ),
                table,
            )]));
        }
    }
    // Private commands, including help, do not enter public history.
    if let Some(response) = private_response {
        return Ok(Some(vec![notice(&caller.name, &response, table)]));
    }
    let mut tx = pool.begin().await?;
    let mut effects = Vec::new();
    for (id, source, who, content, raw) in std::iter::once((
        Some(caller.user),
        "user",
        Some(caller.name.as_str()),
        rendered.map_or_else(|| escape_html(&message), str::to_owned),
        message.clone(),
    ))
    .chain(public_response.map(|r| (None, "server", None, r.clone(), r)))
    {
        let row = sqlx::query!(
            "INSERT INTO chat_log(user_id,source,message) VALUES($1,$2,$3)
             RETURNING id,datetime_sent",
            id.map(|user| user.0),
            source,
            &content
        )
        .fetch_one(&mut *tx)
        .await?;
        let chat_id: i32 = row.id;
        effects.push(Effect::broadcast(Outgoing::new(
            hanabi_protocol::server::CHAT,
            Chat {
                username: who.map(Into::into),
                chat_id: Some(hanabi_protocol::ChatId(i64::from(chat_id))),
                ..Chat::new(
                    content,
                    ChatSource::from_name(source).context("Unknown chat source")?,
                    hanabi_protocol::Timestamp::from(row.datetime_sent),
                )
            },
        )));
        effects.push(Effect::DiscordMirror {
            chat_id,
            message: raw,
        });
    }
    tx.commit().await?;
    if let Some(runtime) = runtime {
        effects.push(runtime);
    }
    Ok(Some(effects))
}

pub async fn lobby_history(pool: &PgPool, count: i64) -> Result<Vec<Chat>> {
    ensure!(count >= 0, "Invalid history count");
    let rows = sqlx::query!(
        "SELECT c.id,c.source,c.message,c.discord_name,c.datetime_sent,
         u.username AS \"username?\" FROM chat_log c LEFT JOIN users u ON u.id=c.user_id
         WHERE c.table_id IS NULL AND c.deleted_at IS NULL
         ORDER BY c.datetime_sent DESC,c.id DESC LIMIT $1",
        count
    )
    .fetch_all(pool)
    .await?;
    let mut result = Vec::new();
    for row in rows.iter().rev() {
        let source: String = row.source.clone();
        let message: String = row.message.clone();
        // Defend against private commands left in history by older servers.
        if source != "server"
            && let Some((command, _)) = parsed(&message)
        {
            if matches!(command.as_str(), "token" | "uptime")
                || simple(&command).is_some_and(|r| r.private)
            {
                continue;
            }

            let known = simple(&command).is_some()
                || WEBSITE.contains(&command.as_str())
                || delegated(&command)
                || ["random", "replay"].contains(&command.as_str())
                || (source == "discord"
                    && ["subscribe", "unsubscribe"].contains(&command.as_str()));
            if !known {
                continue;
            }
        }
        let who = match source.as_str() {
            "server" => None,
            "discord" => row.discord_name.clone(),
            _ => row.username.clone(),
        };
        result.push(Chat {
            chat_id: Some(hanabi_protocol::ChatId(i64::from(row.id))),
            username: who.map(Into::into),
            ..Chat::new(
                message,
                ChatSource::from_name(&source).context("Unknown chat source")?,
                hanabi_protocol::Timestamp::from(row.datetime_sent),
            )
        });
    }
    Ok(result)
}

/// Persist a runtime-generated lobby response before publishing it.
pub async fn server_chat(pool: &PgPool, message: &str) -> Result<SavedChat> {
    let row = sqlx::query!(
        "INSERT INTO chat_log(user_id,source,message) VALUES(NULL,'server',$1)
         RETURNING id, datetime_sent",
        message
    )
    .fetch_one(pool)
    .await?;
    let chat_id: i32 = row.id;
    Ok(SavedChat {
        chat_id,
        broadcast: Outgoing::new(
            hanabi_protocol::server::CHAT,
            Chat {
                chat_id: Some(hanabi_protocol::ChatId(i64::from(chat_id))),
                ..Chat::new(
                    message,
                    ChatSource::Server,
                    hanabi_protocol::Timestamp::from(row.datetime_sent),
                )
            },
        ),
        message: message.into(),
    })
}
