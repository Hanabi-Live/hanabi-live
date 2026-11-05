use super::{Caller, Effect, OnlineUser, notice, warning};
use crate::accounts::{escape_html, is_muted, normalize_chat, normalize_string, regenerate_token};
use anyhow::{Result, ensure};
use chrono::{DateTime, SecondsFormat, Utc};
use serde::Deserialize;
use serde_json::{Value, json};
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
        "../../../../packages/server/src/json/chatReplyCommands.json"
    ))
    .unwrap()
});

const WEBSITE: &[&str] = &[
    "f",
    "friend",
    "friends",
    "link",
    "linked",
    "msg",
    "pm",
    "terminate",
    "unfriend",
    "unlink",
    "version",
    "w",
    "whisper",
];
const DELEGATED: &[&str] = &[
    "m",
    "missing",
    "missing-scores",
    "missingscores",
    "shared-missing-scores",
    "sharedmissingscores",
    "find-variant",
    "findvariant",
    "fv",
    "random-variant",
    "randomvariant",
    "suggest",
    "taglist",
    "tags",
    "sa",
    "split",
    "splitauto",
    "kick",
    "s",
    "s2",
    "s3",
    "s4",
    "s5",
    "s6",
    "si",
    "startin",
    "impostor",
];

pub fn datetime(value: DateTime<Utc>) -> String {
    value.to_rfc3339_opts(SecondsFormat::Millis, true)
}

pub fn valid_room(room: &str) -> bool {
    room == "lobby"
        || room.strip_prefix("table").is_some_and(|id| {
            !id.is_empty()
                && id.bytes().all(|b| b.is_ascii_digit())
                && id
                    .parse::<u64>()
                    .is_ok_and(|id| id <= 9_007_199_254_740_991)
        })
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
    if ["replay", "uptime", "timeleft"].contains(&command.as_str()) {
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
    if command == "token" || simple(&command).is_some_and(|r| r.private) {
        return Classification::Private;
    }
    if simple(&command).is_some()
        || WEBSITE.contains(&command.as_str())
        || DELEGATED.contains(&command.as_str())
        || ["random", "replay", "uptime", "timeleft"].contains(&command.as_str())
    {
        Classification::Public
    } else {
        Classification::Unknown
    }
}

pub async fn external_command(pool: &PgPool, message: &str) -> Result<Vec<Effect>> {
    let Some((command, args)) = parsed(message) else {
        return Ok(vec![]);
    };
    if classify_chat(message) != Classification::Public {
        return Ok(vec![]);
    }
    let response = if let Some(response) = simple(&command) {
        response.response.clone()
    } else if WEBSITE.contains(&command.as_str()) {
        "You cannot perform that command from Discord; please use the website instead.".into()
    } else if command == "random" {
        random_response(&args)
    } else if ["replay", "uptime", "timeleft"].contains(&command.as_str()) {
        return Ok(vec![Effect::RuntimeChat {
            command,
            args: args.iter().map(|s| (*s).into()).collect(),
            room: "lobby".into(),
        }]);
    } else {
        "You can only perform this command while in a game.".into()
    };
    server_chat(pool, &response).await
}

fn help() -> String {
    let mut names: Vec<_> = WEBSITE
        .iter()
        .chain(DELEGATED)
        .chain(["random", "replay", "uptime", "timeleft", "token"].iter())
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
    caller: &Caller,
    online: &[OnlineUser],
    message: &str,
    recipient: &str,
) -> Result<Vec<Effect>> {
    if is_muted(pool, &caller.ip).await? {
        return Ok(vec![warning("You have been muted by an administrator.")]);
    }
    let message = match normalize_chat(message) {
        Ok(message) => message,
        Err(error) => return Ok(vec![warning(error)]),
    };
    let recipient = match normalize_chat(recipient) {
        Ok(recipient) => recipient,
        Err(error) => return Ok(vec![warning(error)]),
    };
    let normalized = normalize_string(&recipient);
    if normalized == caller.normalized_name {
        return Ok(vec![warning(
            "You cannot send a private message to yourself.",
        )]);
    }
    let Some(target) = online.iter().find(|u| u.normalized_name == normalized) else {
        return Ok(vec![warning(&format!(
            "User \"{}\" is not currently online.",
            escape_html(&recipient)
        ))]);
    };
    let message = escape_html(&message);
    let row = sqlx::query!(
        "INSERT INTO chat_log_pm(user_id,recipient_id,message) VALUES($1,$2,$3)
         RETURNING id, datetime_sent",
        caller.id,
        target.id,
        &message
    )
    .fetch_one(pool)
    .await?;
    let data = json!({
        "msg":message, "who":caller.name, "source":"user", "recipient":target.name,
        "pmID":row.id,
        "datetime":datetime(row.datetime_sent),
    });
    Ok(vec![
        Effect::ToSelf {
            command: "chat".into(),
            data: data.clone(),
        },
        Effect::ToUser {
            id: target.id,
            generation: target.generation,
            command: "chat".into(),
            data,
        },
    ])
}

pub async fn private_history(pool: &PgPool, caller: &Caller, data: &Value) -> Result<Vec<Effect>> {
    let amount = data["amount"].as_i64().unwrap_or(0);
    if !(1..=100).contains(&amount) {
        return Ok(vec![warning(
            "Private message history amount must be between 1 and 100.",
        )]);
    }
    let username = data["username"].as_str().unwrap_or("");
    let peer: Option<i32> = if username.is_empty() {
        None
    } else {
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
    };
    let before = data["beforeID"].as_i64().unwrap_or(0);
    let rows = sqlx::query!(
        "SELECT c.id, c.message, c.datetime_sent,
         COALESCE(u.username, 'Deleted user #' || c.user_id) AS who,
         COALESCE(r.username, 'Deleted user #' || c.recipient_id) AS recipient
         FROM chat_log_pm c LEFT JOIN users u ON u.id=c.user_id
         LEFT JOIN users r ON r.id=c.recipient_id
         WHERE (c.user_id=$1 OR c.recipient_id=$1)
           AND ($2::int IS NULL OR (c.user_id=$1 AND c.recipient_id=$2)
                OR (c.user_id=$2 AND c.recipient_id=$1))
           AND ($3::bigint <= 0 OR c.id < $3)
         ORDER BY c.id DESC LIMIT $4",
        caller.id,
        peer,
        before,
        amount + 1
    )
    .fetch_all(pool)
    .await?;
    let more = rows.len() > amount as usize;
    let mut list = Vec::new();
    for row in rows.iter().take(amount as usize).rev() {
        list.push(json!({
            "pmID":row.id, "msg":row.message.clone(),
            "who":row.who.clone(), "recipient":row.recipient.clone(),
            "datetime":datetime(row.datetime_sent),
        }));
    }
    let mut response = json!({"list":list,"hasMore":more});
    if let Some(room) = data["room"].as_str().filter(|s| !s.is_empty()) {
        response["room"] = json!(room);
    }
    Ok(vec![Effect::ToSelf {
        command: "chatPMHistory".into(),
        data: response,
    }])
}

/// Returns None for table chat and table/replay-owned commands. Never persists
/// those messages here. /token is intercepted before either delegation path.
pub async fn lobby_chat(
    pool: &PgPool,
    secret: &str,
    caller: &Caller,
    message: &str,
    room: &str,
    rendered: Option<&str>,
) -> Result<Option<Vec<Effect>>> {
    if is_muted(pool, &caller.ip).await? {
        return Ok(Some(vec![warning(
            "You have been muted by an administrator.",
        )]));
    }
    let message = match normalize_chat(message) {
        Ok(message) => message,
        Err(error) => return Ok(Some(vec![warning(error)])),
    };
    if !valid_room(room) {
        return Ok(Some(vec![warning("That is not a valid room.")]));
    }
    let command = parsed(&message);
    if let Some((command, args)) = &command
        && command == "token"
    {
        let response = if args.iter().any(|arg| !arg.is_empty()) {
            "The format of the /token command is: /token".into()
        } else {
            let token = regenerate_token(pool, secret, caller.id).await?;
            format!(
                "Identity token (valid until {} UTC): <code>{}</code>",
                token.expires_at.to_rfc3339_opts(SecondsFormat::Secs, true),
                token.token
            )
        };
        return Ok(Some(vec![notice(caller, &response, room)]));
    }
    if room != "lobby" {
        return Ok(None);
    }
    let mut private_response = None;
    let mut public_response = None;
    let mut runtime = None;
    if let Some((command, args)) = &command {
        if DELEGATED.contains(&command.as_str()) {
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
        } else if matches!(command.as_str(), "uptime" | "timeleft" | "replay") {
            runtime = Some(Effect::RuntimeChat {
                command: command.clone(),
                args: args.iter().map(|s| (*s).to_owned()).collect(),
                room: room.into(),
            });
        } else {
            return Ok(Some(vec![notice(
                caller,
                &format!(
                    "The chat command of <code>/{}</code> is not valid. Use <code>/help</code> to get a list of available commands.",
                    escape_html(command)
                ),
                room,
            )]));
        }
    }
    // Private commands, including help, do not enter public history.
    if let Some(response) = private_response {
        return Ok(Some(vec![notice(caller, &response, room)]));
    }
    let mut tx = pool.begin().await?;
    let mut effects = Vec::new();
    for (id, source, who, content, raw) in std::iter::once((
        caller.id,
        "user",
        caller.name.as_str(),
        rendered
            .map(str::to_owned)
            .unwrap_or_else(|| escape_html(&message)),
        message.clone(),
    ))
    .chain(public_response.map(|r| (0, "server", "Hanab Live", r.clone(), r)))
    {
        let row = sqlx::query!(
            "INSERT INTO chat_log(user_id,source,message,room) VALUES($1,$2,$3,'lobby')
             RETURNING id,datetime_sent",
            id,
            source,
            &content
        )
        .fetch_one(&mut *tx)
        .await?;
        let chat_id: i32 = row.id;
        effects.push(Effect::Broadcast {
            command: "chat".into(),
            data: json!({"msg":content,"who":who,"source":source,"room":"lobby","chatID":chat_id,
                "datetime":datetime(row.datetime_sent)}),
        });
        effects.push(Effect::DiscordMirror {
            chat_id,
            server: source == "server",
            message: raw,
        });
    }
    tx.commit().await?;
    if let Some(runtime) = runtime {
        effects.push(runtime);
    }
    Ok(Some(effects))
}

pub async fn lobby_history(pool: &PgPool, count: i64) -> Result<Vec<Value>> {
    ensure!(count >= 0, "Invalid history count");
    let rows = sqlx::query!(
        "SELECT c.id,c.user_id,c.source,c.message,c.discord_name,c.datetime_sent,
         u.username AS \"username?\" FROM chat_log c LEFT JOIN users u ON u.id=c.user_id
         WHERE c.room='lobby' AND c.deleted_at IS NULL
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
            if command == "token" || simple(&command).is_some_and(|r| r.private) {
                continue;
            }

            if simple(&command).is_none()
                && !WEBSITE.contains(&command.as_str())
                && !DELEGATED.contains(&command.as_str())
                && !["random", "replay", "uptime", "timeleft"].contains(&command.as_str())
                && !(source == "discord"
                    && ["subscribe", "unsubscribe"].contains(&command.as_str()))
            {
                continue;
            }
        }
        let who = match source.as_str() {
            "server" => "__server".into(),
            "discord" => row.discord_name.clone().unwrap_or_default(),
            _ => row
                .username
                .clone()
                .unwrap_or_else(|| format!("Deleted user #{}", row.user_id)),
        };
        result.push(json!({
            "chatID":row.id, "msg":message, "who":who,
            "source":source, "room":"lobby", "datetime":datetime(row.datetime_sent),
        }));
    }
    Ok(result)
}

/// Persist a runtime-generated lobby response before publishing it.
pub async fn server_chat(pool: &PgPool, message: &str) -> Result<Vec<Effect>> {
    let row = sqlx::query!(
        "INSERT INTO chat_log(user_id,source,message,room) VALUES(0,'server',$1,'lobby')
         RETURNING id, datetime_sent",
        message
    )
    .fetch_one(pool)
    .await?;
    let chat_id: i32 = row.id;
    Ok(vec![
        Effect::Broadcast {
            command: "chat".into(),
            data: json!({
                "msg":message,"who":"Hanab Live","source":"server","room":"lobby",
                "chatID":chat_id,"datetime":datetime(row.datetime_sent)
            }),
        },
        Effect::DiscordMirror {
            chat_id,
            server: true,
            message: message.into(),
        },
    ])
}
