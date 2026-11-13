use super::{Effect, ExternalReply, OnlineUser, Publication, SavedChat, notice, refused};
use crate::accounts::{is_muted, normalize_chat, normalize_string, regenerate_token};
use crate::transport::{Identity, Outgoing};
use anyhow::{Context, Result, ensure};
use chrono::SecondsFormat;
use hanabi_protocol::{
    Chat, ChatAuthor, ChatMessage, ChatPmHistory, ChatPmHistoryRequest, ChatSource, TableId,
};
use serde::Deserialize;
use sqlx::PgPool;
use std::sync::LazyLock;

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SimpleResponse {
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

/// The reply to a command that the website runs itself, when it comes from Discord.
const WEBSITE_ONLY_RESPONSE: &str =
    "You cannot perform that command from Discord; please use the website instead.";

/// The reply to a table command outside of a table.
const TABLE_ONLY_RESPONSE: &str = "You can only perform this command while in a game.";

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

/// A chat command whose reply needs the server's runtime information.
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum RuntimeCommand {
    /// Links to a replay. The link needs the server's domain.
    Replay,
    /// Says how long the server has run. Only the sender sees it.
    Uptime,
}

/// What a chat command does.
#[derive(Clone, Copy)]
pub enum CommandKind {
    /// A fixed reply from `chatReplyCommands.json`.
    Reply(&'static SimpleResponse),
    /// A command that the website runs itself, so that only Discord sends it to the server.
    Website,
    Table(TableChatCommand),
    Random,
    Runtime(RuntimeCommand),
    /// Gives the sender a new identity token. Only the sender sees it.
    Token,
    Unknown,
}

/// The commands that the server runs in the lobby and at tables.
const SERVER_COMMANDS: &[(&str, CommandKind)] = &[
    ("random", CommandKind::Random),
    ("replay", CommandKind::Runtime(RuntimeCommand::Replay)),
    ("token", CommandKind::Token),
    ("uptime", CommandKind::Runtime(RuntimeCommand::Uptime)),
];

/// How the lobby and Discord treat a chat message.
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum Classification {
    /// Not a command.
    Text,
    /// A command that everyone sees, with its reply.
    Public,
    /// A command that only its sender sees, with its reply.
    Private,
    /// A command that the server does not know.
    Unknown,
}

pub enum GeneralResponse {
    Public(String),
    Private(String),
    Runtime {
        command: RuntimeCommand,
        args: Vec<String>,
    },
}

/// A chat message that starts with a slash: the command's lowercase name, what it does, and the
/// words after it.
pub struct ChatCommand<'a> {
    pub name: String,
    pub kind: CommandKind,
    pub args: Vec<&'a str>,
}

impl<'a> ChatCommand<'a> {
    /// Reads the command of a normalized chat message. Returns `None` for a message that is not a
    /// command.
    pub fn parse(message: &'a str) -> Option<Self> {
        let mut words = message.split_whitespace();
        let name = words.next()?.strip_prefix('/')?.to_lowercase();
        if name.is_empty() {
            return None;
        }
        let kind = if let Some(command) = TableChatCommand::parse(&name) {
            CommandKind::Table(command)
        } else if let Some(response) = simple(&name) {
            CommandKind::Reply(response)
        } else if hanabi_protocol::WEBSITE_CHAT_COMMANDS.contains(&name.as_str()) {
            CommandKind::Website
        } else {
            SERVER_COMMANDS
                .iter()
                .find(|(server_name, _)| *server_name == name)
                .map_or(CommandKind::Unknown, |(_, kind)| *kind)
        };
        Some(Self {
            name,
            kind,
            args: words.collect(),
        })
    }

    pub fn classification(&self) -> Classification {
        match self.kind {
            CommandKind::Token | CommandKind::Runtime(RuntimeCommand::Uptime) => {
                Classification::Private
            }
            CommandKind::Reply(response) if response.private => Classification::Private,
            CommandKind::Unknown => Classification::Unknown,
            _ => Classification::Public,
        }
    }

    /// The reply to a command that runs the same way in the lobby, at a table, and from Discord.
    pub fn general_response(&self) -> Option<GeneralResponse> {
        Some(match self.kind {
            CommandKind::Reply(response) => {
                let content = if response.is_help {
                    format!("\nList of commands:\n{}\n{}", help(), response.response)
                } else {
                    response.response.clone()
                };
                if response.private {
                    GeneralResponse::Private(content)
                } else {
                    GeneralResponse::Public(content)
                }
            }
            CommandKind::Website => GeneralResponse::Public(WEBSITE_ONLY_RESPONSE.into()),
            CommandKind::Random => GeneralResponse::Public(random_response(&self.args)),
            CommandKind::Runtime(RuntimeCommand::Replay) => GeneralResponse::Runtime {
                command: RuntimeCommand::Replay,
                args: self.args.iter().map(|arg| (*arg).into()).collect(),
            },
            CommandKind::Table(_)
            | CommandKind::Runtime(RuntimeCommand::Uptime)
            | CommandKind::Token
            | CommandKind::Unknown => return None,
        })
    }
}

impl TableChatCommand {
    /// Reads a lowercase command name without its slash.
    pub fn parse(command: &str) -> Option<Self> {
        TABLE_COMMANDS
            .iter()
            .find(|(name, _)| *name == command)
            .map(|(_, parsed)| *parsed)
    }
}

fn simple(command: &str) -> Option<&'static SimpleResponse> {
    RESPONSES
        .iter()
        .find(|r| r.command == command || r.alias.iter().any(|a| a == command))
}

pub fn classify_chat(message: &str) -> Classification {
    ChatCommand::parse(message).map_or(Classification::Text, |command| command.classification())
}

pub async fn external_command(pool: &PgPool, message: &str) -> Result<Option<ExternalReply>> {
    let Some(command) = ChatCommand::parse(message) else {
        return Ok(None);
    };
    if command.classification() != Classification::Public {
        return Ok(None);
    }
    let response = match command.general_response() {
        Some(GeneralResponse::Public(response)) => response,
        Some(GeneralResponse::Private(_)) => return Ok(None),
        Some(GeneralResponse::Runtime { command, args }) => {
            return Ok(Some(ExternalReply::Runtime { command, args }));
        }
        // Only the table commands are public and have no general response.
        None => TABLE_ONLY_RESPONSE.into(),
    };
    Ok(Some(ExternalReply::Saved(
        server_chat(pool, &response).await?,
    )))
}

fn help() -> String {
    let mut names: Vec<_> = hanabi_protocol::WEBSITE_CHAT_COMMANDS
        .iter()
        .chain(TABLE_COMMANDS.iter().map(|(name, _)| name))
        .chain(SERVER_COMMANDS.iter().map(|(name, _)| name))
        .map(|s| format!("/{s}"))
        .collect();
    names.extend(RESPONSES.iter().map(|r| format!("/{}", r.command)));
    names.sort();
    names.dedup();
    names.join(", ")
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
                    format!("\"{arg}\" is not an integer.")
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
        return refused("You have been muted by an administrator.");
    }
    let message = match normalize_chat(message) {
        Ok(message) => message,
        Err(error) => return refused(error),
    };
    let recipient = match normalize_chat(recipient) {
        Ok(recipient) => recipient,
        Err(error) => return refused(error),
    };
    let normalized = normalize_string(&recipient);
    if normalized == caller.normalized_name {
        return refused("You cannot send a private message to yourself.");
    }
    let Some(target) = online
        .iter()
        .find(|u| u.identity.normalized_name == normalized)
    else {
        return refused(format!("User \"{recipient}\" is not currently online."));
    };
    if super::blocked_between(pool, caller.user, &[target.identity.user]).await? {
        return refused(format!(
            "You cannot send a private message to \"{}\".",
            target.identity.name
        ));
    }
    let row = sqlx::query!(
        "INSERT INTO chat_log_pm(user_id,recipient_id,message) VALUES($1,$2,$3)
         RETURNING id, datetime_sent",
        caller.user.get(),
        target.identity.user.get(),
        &message
    )
    .fetch_one(pool)
    .await?;
    let data = Chat::from(ChatMessage::private(
        message,
        ChatAuthor::User {
            username: caller.name.clone().into(),
        },
        target.identity.name.clone(),
        hanabi_protocol::Timestamp::from(row.datetime_sent),
    ));
    Ok(vec![
        Effect::to_self(Outgoing::new(hanabi_protocol::event::CHAT, data.clone())),
        Publication::ToUser {
            id: target.identity.user,
            generation: target.generation,
            message: Outgoing::new(hanabi_protocol::event::CHAT, data),
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
            return refused(format!("User \"{username}\" does not exist."));
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
        caller.user.get(),
        peer,
        amount
    )
    .fetch_all(pool)
    .await?;
    let mut list = Vec::new();
    for row in rows.iter().rev() {
        list.push(ChatMessage::private(
            row.message.clone(),
            ChatAuthor::User {
                username: row
                    .who
                    .clone()
                    .context("Missing private message author")?
                    .into(),
            },
            row.recipient
                .clone()
                .context("Missing private message recipient")?,
            hanabi_protocol::Timestamp::from(row.datetime_sent),
        ));
    }
    Ok(vec![Effect::Reply(
        hanabi_protocol::reply::CHAT_PM_HISTORY.data(ChatPmHistory { messages: list }),
    )])
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
        return refused("You have been muted by an administrator.");
    }
    let message = match normalize_chat(message) {
        Ok(message) => message,
        Err(error) => return refused(error),
    };
    let command = ChatCommand::parse(&message);
    match command
        .as_ref()
        .map(|command| (command.kind, command.args.is_empty()))
    {
        Some((CommandKind::Token, no_args)) => {
            let response = if no_args {
                let token = regenerate_token(pool, secret, caller.user.get(), &caller.ip).await?;
                format!(
                    "Identity token (valid until {} UTC): {}",
                    token.expires_at.to_rfc3339_opts(SecondsFormat::Secs, true),
                    token.token
                )
            } else {
                "The format of the /token command is: /token".into()
            };
            return Ok(Some(vec![notice(&caller.name, &response)]));
        }
        Some((CommandKind::Runtime(RuntimeCommand::Uptime), _)) => {
            return Ok(Some(vec![Effect::RuntimeChat {
                command: RuntimeCommand::Uptime,
                args: vec![],
            }]));
        }
        _ => {}
    }
    if table.is_some() {
        return Ok(None);
    }
    let mut public_response = None;
    let mut runtime = None;
    if let Some(command) = &command {
        match command.general_response() {
            // Private commands, including help, do not enter public history.
            Some(GeneralResponse::Private(response)) => {
                return Ok(Some(vec![notice(&caller.name, &response)]));
            }
            Some(GeneralResponse::Public(response)) => public_response = Some(response),
            Some(GeneralResponse::Runtime { command, args }) => {
                runtime = Some(Effect::RuntimeChat { command, args });
            }
            None if matches!(command.kind, CommandKind::Table(_)) => {
                public_response = Some(TABLE_ONLY_RESPONSE.into());
            }
            None => {
                return Ok(Some(vec![notice(
                    &caller.name,
                    &format!(
                        "The chat command of \"/{}\" is not valid. Use \"/help\" to get a list of available commands.",
                        command.name
                    ),
                )]));
            }
        }
    }
    let mut tx = pool.begin().await?;
    let mut effects = Vec::new();
    for (id, source, who, content, raw) in std::iter::once((
        Some(caller.user),
        "user",
        Some(caller.name.as_str()),
        rendered.map_or_else(|| message.clone(), str::to_owned),
        message.clone(),
    ))
    .chain(public_response.map(|r| (None, "server", None, r.clone(), r)))
    {
        let row = sqlx::query!(
            "INSERT INTO chat_log(user_id,source,message) VALUES($1,$2,$3)
             RETURNING id,datetime_sent",
            id.map(hanabi_protocol::UserId::get),
            source,
            &content
        )
        .fetch_one(&mut *tx)
        .await?;
        let chat_id: i32 = row.id;
        effects.push(Effect::broadcast(Outgoing::new(
            hanabi_protocol::event::CHAT,
            Chat::from(ChatMessage {
                chat_id: Some(hanabi_protocol::ChatId::try_from(chat_id)?),
                ..ChatMessage::public(
                    content,
                    ChatAuthor::new(
                        ChatSource::from_name(source).context("Unknown chat source")?,
                        who.map(Into::into),
                    )
                    .context("Invalid chat author")?,
                    hanabi_protocol::Timestamp::from(row.datetime_sent),
                )
            }),
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

pub async fn lobby_history(pool: &PgPool, count: i64) -> Result<Vec<ChatMessage>> {
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
            && let Some(command) = ChatCommand::parse(&message)
        {
            let shown = match command.classification() {
                Classification::Text | Classification::Public => true,
                Classification::Private => false,
                Classification::Unknown => {
                    source == "discord"
                        && ["subscribe", "unsubscribe"].contains(&command.name.as_str())
                }
            };
            if !shown {
                continue;
            }
        }
        let who = match source.as_str() {
            "server" => None,
            "discord" => row.discord_name.clone(),
            _ => row.username.clone(),
        };
        result.push(ChatMessage {
            chat_id: Some(hanabi_protocol::ChatId::try_from(row.id)?),
            ..ChatMessage::public(
                message,
                ChatAuthor::new(
                    ChatSource::from_name(&source).context("Unknown chat source")?,
                    who.map(Into::into),
                )
                .context("Invalid chat author")?,
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
            hanabi_protocol::event::CHAT,
            Chat::from(ChatMessage {
                chat_id: Some(hanabi_protocol::ChatId::try_from(chat_id)?),
                ..ChatMessage::server(message, hanabi_protocol::Timestamp::from(row.datetime_sent))
            }),
        ),
        message: message.into(),
    })
}
