//! Runs a connection's commands: it routes each one, runs lobby commands, and tells the player
//! about failures.

use super::{App, protocol, socket::load_lobby, user};
use crate::{
    accounts,
    actors::{HubCommand, request},
    errors::{CommandError, CommandResult},
    lifecycle::Refusal,
    lobby::{self, Effect, Publication},
    routing::Route,
    transport::{Session, frame},
};
use anyhow::Context;
use axum::http::StatusCode;
use hanabi_protocol::{ClientMessage, ReplyData};
use std::sync::Arc;
use tokio::sync::mpsc;

/// What a player is told about a command that failed, and the report of a failure.
pub(super) struct CommandFailure {
    pub(super) notice: hanabi_protocol::Notice,
    /// Whether the client shows nothing, as for a move that a speedrun refuses.
    pub(super) silent: bool,
    /// Absent for a rejection, which is the server working as intended.
    pub(super) report: Option<crate::errors::Report>,
    /// Whether the failure is posted to the error alerts. For now, only failures of storage,
    /// services, and the runtime are, which the report recognizes.
    pub(super) alert: bool,
}

/// What to tell a player about a failed command, which `command` names if it is registered.
pub(super) fn command_failure(error: CommandError, command: Option<&str>) -> CommandFailure {
    let name = command.unwrap_or("unknown command");
    let operation = match name {
        "gameHistory" => "Loading game history".to_owned(),
        "seedGames" => "Loading seed history".to_owned(),
        "settings" => "Saving preferences".to_owned(),
        _ => format!("Command {name}"),
    };
    let (report, alert) = match error {
        CommandError::Rejected { message, silent } => {
            return CommandFailure {
                notice: hanabi_protocol::Notice {
                    message: accounts::escape_html(&message),
                    code: silent.then_some(hanabi_protocol::NoticeCode::CommandIgnored),
                },
                silent,
                report: None,
                alert: false,
            };
        }
        CommandError::Unavailable(fault) => (
            crate::errors::Report::known(operation, fault.code, fault.description, fault.status),
            true,
        ),
        CommandError::Internal(error) => {
            let report = crate::errors::Report::from_error(operation.clone(), &error);
            if report.code != hanabi_protocol::NoticeCode::InternalOperationFailed {
                (report, true)
            } else if error.root_cause().is::<crate::errors::Described>() {
                // The server wrote this description, so the player sees all of it.
                (
                    crate::errors::Report::known(
                        operation,
                        hanabi_protocol::NoticeCode::CommandFailed,
                        format!("{error:#}"),
                        StatusCode::INTERNAL_SERVER_ERROR,
                    ),
                    false,
                )
            } else {
                // The cause could hold anything, so only the log shows it.
                tracing::error!(
                    diagnostic_id = %report.diagnostic_id,
                    "{operation} failed: {error:#}"
                );
                (report, false)
            }
        }
    };
    CommandFailure {
        notice: report.notice(),
        silent: false,
        report: Some(report),
        alert,
    }
}

/// The failure of a request that could not be read.
pub(super) fn invalid_request(command: Option<&str>, error: &anyhow::Error) -> CommandError {
    let detail = if let Some(json) = error.downcast_ref::<serde_json::Error>() {
        format!(
            "Invalid JSON at line {}, column: {}",
            json.line(),
            json.column()
        )
    } else {
        error.to_string()
    };
    let command = command.unwrap_or("unrecognized command");
    rejection!("Cannot process {command}: {detail}")
}

/// Does the work of a lobby command's effects that needs the server's runtime or integrations, and
/// has the hub publish the rest.
async fn publish(
    app: &App,
    session: Arc<Session>,
    effects: Vec<Effect>,
) -> CommandResult<Option<ReplyData>> {
    let mut publications = vec![];
    let mut mirrors = vec![];
    let mut reply = None;
    for effect in effects {
        match effect {
            Effect::Publish(publication) => publications.push(publication),
            Effect::Reply(data) => reply = Some(data),
            Effect::DiscordMirror { chat_id, message } => mirrors.push((chat_id, message)),
            Effect::RuntimeChat { command, args } => {
                for message in app.info.runtime_response(&command, &args)? {
                    if command == "uptime" {
                        publications.push(lobby::notice_publication(&session.name, &message));
                        continue;
                    }
                    let saved = lobby::server_chat(&app.store.primary, &message).await?;
                    publications.push(Publication::Broadcast(saved.broadcast));
                    mirrors.push((saved.chat_id, saved.message));
                }
            }
        }
    }
    request(&app.hub, |reply| HubCommand::LobbyEffects {
        session,
        effects: publications,
        reply,
    })
    .await??;
    if let Some(integrations) = app.integrations.get() {
        for (id, raw) in mirrors {
            integrations.mirror(id, Some(&raw)).await;
        }
    }
    Ok(reply)
}

/// How a lobby command ended: with its reply's data, if it has any, or with a table's chat
/// message, which continues to its table.
pub(super) enum LobbyOutcome {
    Done(Option<ReplyData>),
    TableChat(ClientMessage),
}

/// Runs a lobby command for its user's task and publishes its effects.
pub(super) async fn lobby_command(
    app: &App,
    session: Arc<Session>,
    message: ClientMessage,
) -> CommandResult<LobbyOutcome> {
    // Only private messages need the list of online users.
    let online = if matches!(message, ClientMessage::ChatPm(_)) {
        request(&app.hub, |reply| HubCommand::Directory {
            session: session.clone(),
            reply,
        })
        .await??
    } else {
        Vec::new()
    };
    let caller = session.identity.clone();
    let rendered = match &message {
        ClientMessage::Chat(request) if request.table_id.is_none() => {
            discord_rendering(app, &request.text).await
        }
        _ => None,
    };
    let history = history_command(&message);
    let pool = if history {
        &app.store.lobby_reads
    } else {
        &app.store.primary
    };
    let chat = matches!(message, ClientMessage::Chat(_)).then(|| message.clone());
    let work = lobby::dispatch(
        pool,
        &app.public.session_secret,
        &caller,
        &online,
        rendered.as_deref(),
        message,
    );
    let effects = if history {
        tokio::select! {
            () = app.lifecycle.read_shutdown.cancelled() => return Ok(LobbyOutcome::Done(None)),
            result = work => result.context(crate::errors::LobbyRead)?,
        }
    } else {
        work.await?
    };
    let Some(effects) = effects else {
        // A table's chat continues to its table.
        return Ok(chat.map_or(LobbyOutcome::Done(None), LobbyOutcome::TableChat));
    };
    Ok(LobbyOutcome::Done(publish(app, session, effects).await?))
}

/// A lobby chat message as Discord shows it, for one that Discord mirrors.
async fn discord_rendering(app: &App, text: &str) -> Option<String> {
    let normalized = accounts::normalize_chat(text).ok()?;
    if !matches!(
        lobby::classify_chat(&normalized),
        lobby::Classification::Text | lobby::Classification::Public
    ) {
        return None;
    }
    Some(app.integrations.get()?.render(&normalized).await)
}

fn history_command(message: &ClientMessage) -> bool {
    matches!(
        message,
        ClientMessage::GameHistory(_) | ClientMessage::SeedGames(_)
    )
}

/// Runs a request's command. Returns the data of its reply, if it has any.
pub(super) async fn dispatch(
    app: &Arc<App>,
    user: &mpsc::Sender<user::UserCommand>,
    session: Arc<Session>,
    message: ClientMessage,
) -> CommandResult<Option<ReplyData>> {
    let _admission = match app.lifecycle.admit().await {
        Ok(admission) => admission,
        Err(Refusal::Unavailable) => {
            return Err(crate::errors::Fault::new(hanabi_protocol::NoticeCode::LiveStateUnavailable,
                "Live-state recovery or ownership is unavailable. Do not repeat game actions; wait for recovery.",
                StatusCode::SERVICE_UNAVAILABLE).into());
        }
        Err(Refusal::NotAccepting) => {
            return Err(crate::errors::Fault::new(
                hanabi_protocol::NoticeCode::ServerDraining,
                "The server is not accepting new commands during startup or maintenance.",
                StatusCode::SERVICE_UNAVAILABLE,
            )
            .into());
        }
    };
    ensure_or_reject!(
        session.active(),
        "This session was replaced or disconnected. Reconnect before sending commands."
    );
    let mut measurement = crate::metrics::COMMAND_METRICS.start(message.name());
    let route = crate::routing::route(&message);
    if route == Route::Connection {
        session.emit(&frame(
            hanabi_protocol::server::LOBBY_STATUS,
            hanabi_protocol::LobbyStatus::Loading {},
        ));
        load_lobby(app.clone(), session);
        measurement.success();
        return Ok(None);
    }
    let message = if matches!(route, Route::Lobby | Route::TableChat(_)) {
        let outcome = request(user, |reply| user::UserCommand::Lobby {
            session: session.clone(),
            message: Box::new(message),
            reply,
        })
        .await??;
        match outcome {
            LobbyOutcome::Done(data) => {
                measurement.success();
                return Ok(data);
            }
            // Table chat continues to its table.
            LobbyOutcome::TableChat(message) => message,
        }
    } else {
        message
    };
    request(&app.hub, |reply| HubCommand::Client {
        session,
        message,
        reply,
    })
    .await??;
    measurement.success();
    Ok(None)
}

/// Runs a request and answers it. A request that succeeded is answered through the hub, after the
/// messages that its work published.
pub(super) async fn answer(
    app: &Arc<App>,
    user: &mpsc::Sender<user::UserCommand>,
    session: &Arc<Session>,
    input: &str,
) {
    let request = protocol::parse(input);
    let outcome = match request.message {
        Ok(message) => dispatch(app, user, session.clone(), message).await,
        Err(error) => Err(invalid_request(request.command, &error)),
    };
    match outcome {
        Ok(data) => {
            let Some(id) = request.id else {
                return;
            };
            let data = data.filter(|data| {
                let matches = Some(data.command) == request.command;
                if !matches {
                    tracing::error!(
                        "The reply to {:?} carried the data of {}",
                        request.command,
                        data.command
                    );
                }
                matches
            });
            // A replaced or closed session has no one to answer.
            let _ = request_reply(app, session, crate::transport::reply_frame(id, data)).await;
        }
        Err(error) => {
            let failure = command_failure(error, request.command);
            if let Some(report) = &failure.report {
                report.log();
                if failure.alert {
                    app.alert(report);
                }
            }
            if let Some(id) = request.id {
                session.emit(&crate::transport::error_frame(id, failure.notice));
            } else if !failure.silent {
                session.emit(&frame(hanabi_protocol::server::WARNING, failure.notice));
            }
        }
    }
}

async fn request_reply(
    app: &App,
    session: &Arc<Session>,
    frame: crate::transport::Frame,
) -> CommandResult {
    request(&app.hub, |reply| HubCommand::Reply {
        session: session.clone(),
        frame,
        reply,
    })
    .await?
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn command_failures_show_rejections_as_they_are_and_report_everything_else() {
        let command = Some("tableJoin");
        let rejected = command_failure(rejection!("This table is full."), command);
        assert_eq!(rejected.notice.message, "This table is full.");
        assert!(rejected.report.is_none() && !rejected.alert);
        let silent = CommandError::Rejected {
            message: "Not your turn.".into(),
            silent: true,
        };
        let silent = command_failure(silent, command);
        assert!(silent.silent);
        assert_eq!(
            silent.notice.code,
            Some(hanabi_protocol::NoticeCode::CommandIgnored)
        );

        let unexpected = command_failure(
            anyhow::Error::new(crate::errors::Described(
                "Duplicate table installation".into(),
            ))
            .context("Installing the table")
            .into(),
            command,
        );
        let report = unexpected.report.expect("reported failure");
        assert_eq!(report.code, hanabi_protocol::NoticeCode::CommandFailed);
        assert!(!unexpected.alert);
        assert_eq!(
            unexpected.notice.message,
            format!(
                "Command tableJoin failed: Installing the table: Duplicate table installation \
                 [Reference: {}]",
                report.diagnostic_id
            )
        );

        // A cause that the server did not write stays out of the notice.
        let parse = "x".parse::<i32>().expect_err("not a number");
        let raw = command_failure(
            anyhow::Error::from(parse.clone())
                .context("Reading the seat")
                .into(),
            command,
        );
        let report = raw.report.expect("reported failure");
        assert_eq!(
            report.code,
            hanabi_protocol::NoticeCode::InternalOperationFailed
        );
        assert!(!raw.alert);
        assert!(
            !raw.notice.message.contains(&parse.to_string())
                && !raw.notice.message.contains("seat")
        );

        let storage = command_failure(sqlx::Error::PoolClosed.into(), command);
        assert!(storage.alert && storage.report.is_some());
        assert!(!storage.notice.message.contains("PoolClosed"));

        // Storage reports a fault as the error's context, which the conversion keeps.
        let fault =
            anyhow::Error::from(sqlx::Error::PoolClosed).context(crate::errors::Fault::new(
                hanabi_protocol::NoticeCode::PersistenceUncertain,
                "The write may have been saved.",
                StatusCode::SERVICE_UNAVAILABLE,
            ));
        let CommandError::Unavailable(fault) = CommandError::from(fault) else {
            panic!("A fault was not unavailable");
        };
        assert_eq!(
            fault.code,
            hanabi_protocol::NoticeCode::PersistenceUncertain
        );
        let unavailable = command_failure(CommandError::Unavailable(fault), command);
        assert!(unavailable.alert && unavailable.report.is_some());
        assert!(
            unavailable
                .notice
                .message
                .contains("The write may have been saved.")
        );
    }
}
