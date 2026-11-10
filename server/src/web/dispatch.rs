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
use hanabi_protocol::ClientMessage;
use std::sync::Arc;
use tokio::sync::mpsc;

/// What a player is told about a command that failed, and the report of a failure.
pub(super) struct CommandFailure {
    pub(super) warning: String,
    /// Absent for a rejection, which is the server working as intended.
    pub(super) report: Option<crate::errors::Report>,
    /// Whether the failure is posted to the error alerts. For now, only failures of storage,
    /// services, and the runtime are, which the report recognizes.
    pub(super) alert: bool,
}

/// What to tell a player about a failed command, or nothing for a silent rejection.
pub(super) fn command_failure(error: CommandError, command: &str) -> Option<CommandFailure> {
    let name = protocol::command_name(command).unwrap_or("unknown command");
    let operation = match name {
        "historyGet" => "Loading game history".to_owned(),
        "historyGetSeed" => "Loading seed history".to_owned(),
        "setting" => "Saving preferences".to_owned(),
        _ => format!("Command {name}"),
    };
    let (report, alert) = match error {
        CommandError::Rejected { silent: true, .. } => return None,
        CommandError::Rejected { message, .. } => {
            return Some(CommandFailure {
                warning: accounts::escape_html(&message),
                report: None,
                alert: false,
            });
        }
        CommandError::Unavailable(fault) => (
            crate::errors::Report::known(operation, fault.code, fault.description, fault.status),
            true,
        ),
        CommandError::Internal(error) => {
            let report = crate::errors::Report::from_error(operation.clone(), &error);
            if report.code != crate::errors::INTERNAL_OPERATION_FAILED {
                (report, true)
            } else if error.root_cause().is::<crate::errors::Described>() {
                // The server wrote this description, so the player sees all of it.
                (
                    crate::errors::Report::known(
                        operation,
                        crate::errors::COMMAND_FAILED,
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
    Some(CommandFailure {
        warning: accounts::escape_html(&report.text()),
        report: Some(report),
        alert,
    })
}

/// Does the work of a lobby command's effects that needs the server's runtime or integrations, and
/// has the hub publish the rest.
async fn publish(app: &App, session: Arc<Session>, effects: Vec<Effect>) -> CommandResult {
    let mut publications = vec![];
    let mut mirrors = vec![];
    for effect in effects {
        match effect {
            Effect::Publish(publication) => publications.push(publication),
            Effect::DiscordMirror { chat_id, message } => mirrors.push((chat_id, message)),
            Effect::RuntimeChat {
                command,
                args,
                room,
            } => {
                for message in app.info.runtime_response(&command, &args)? {
                    if command == "uptime" {
                        publications.push(lobby::notice_publication(
                            &session.name,
                            &message,
                            &room,
                        ));
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
    Ok(())
}

/// Runs a lobby command for its user's task and publishes its effects. Returns a table's chat,
/// which continues to its table after the lobby checks it.
pub(super) async fn lobby_command(
    app: &App,
    session: Arc<Session>,
    message: ClientMessage,
) -> CommandResult<Option<ClientMessage>> {
    // Only private messages need the list of online users.
    let online = if matches!(message, ClientMessage::ChatPM(_)) {
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
        ClientMessage::Chat(request) if request.room == "lobby" => {
            discord_rendering(app, &request.msg).await
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
            () = app.lifecycle.read_shutdown.cancelled() => return Ok(None),
            result = work => result.context(crate::errors::LobbyRead)?,
        }
    } else {
        work.await?
    };
    let Some(effects) = effects else {
        // A table's chat continues to its table.
        return Ok(chat);
    };
    publish(app, session, effects).await?;
    Ok(None)
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
        ClientMessage::HistoryGet(_) | ClientMessage::HistoryGetSeed(_)
    )
}

pub(super) async fn dispatch(
    app: &Arc<App>,
    user: &mpsc::Sender<user::UserCommand>,
    session: Arc<Session>,
    input: &str,
) -> CommandResult {
    let _admission = match app.lifecycle.admit().await {
        Ok(admission) => admission,
        Err(Refusal::Unavailable) => {
            return Err(crate::errors::Fault::new("live_state_unavailable",
                "Live-state recovery or ownership is unavailable. Do not repeat game actions; wait for recovery.",
                StatusCode::SERVICE_UNAVAILABLE).into());
        }
        Err(Refusal::NotAccepting) => {
            return Err(crate::errors::Fault::new(
                crate::errors::SERVER_DRAINING,
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
    let message = match protocol::parse(input) {
        Ok(parsed) => parsed,
        Err(error) => {
            let detail = if let Some(json) = error.downcast_ref::<serde_json::Error>() {
                format!(
                    "Invalid JSON at line {}, column: {}",
                    json.line(),
                    json.column()
                )
            } else {
                error.to_string()
            };
            let command = protocol::command_name(input).unwrap_or("unrecognized command");
            session.emit(&frame(
                hanabi_protocol::server::WARNING,
                hanabi_protocol::Warning {
                    warning: accounts::escape_html(&format!("Cannot process {command}: {detail}")),
                },
            ));
            return Ok(());
        }
    };
    let mut measurement = crate::metrics::COMMAND_METRICS.start(message.name());
    let route = crate::routing::route(&message);
    if route == Route::Connection {
        session.emit(&frame(
            hanabi_protocol::server::LOBBY_STATUS,
            hanabi_protocol::LobbyStatus::Loading { total_games: () },
        ));
        load_lobby(app.clone(), session);
        measurement.success();
        return Ok(());
    }
    let message = if matches!(route, Route::Lobby | Route::TableChat(_)) {
        let answer = request(user, |reply| user::UserCommand::Lobby {
            session: session.clone(),
            message: Box::new(message),
            reply,
        })
        .await??;
        // Table chat continues to its table.
        let Some(message) = answer else {
            measurement.success();
            return Ok(());
        };
        message
    } else {
        message
    };
    request(&app.hub, |reply| {
        if let ClientMessage::Sync(_) = message {
            HubCommand::Sync { session, reply }
        } else {
            HubCommand::Client {
                session,
                message,
                reply,
            }
        }
    })
    .await??;
    measurement.success();
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn command_failures_show_rejections_as_they_are_and_report_everything_else() {
        let command = r#"tableJoin {"tableID":1}"#;
        let rejected = command_failure(rejection!("This table is full."), command).unwrap();
        assert_eq!(rejected.warning, "This table is full.");
        assert!(rejected.report.is_none() && !rejected.alert);
        let silent = CommandError::Rejected {
            message: "Not your turn.".into(),
            silent: true,
        };
        assert!(command_failure(silent, command).is_none());

        let unexpected = command_failure(
            anyhow::Error::new(crate::errors::Described(
                "Duplicate table installation".into(),
            ))
            .context("Installing the table")
            .into(),
            command,
        )
        .unwrap();
        let report = unexpected.report.expect("reported failure");
        assert_eq!(report.code, crate::errors::COMMAND_FAILED);
        assert!(!unexpected.alert);
        assert_eq!(
            unexpected.warning,
            format!(
                "Command tableJoin failed: Installing the table: Duplicate table installation \
                 [Reference: {}]",
                report.diagnostic_id
            )
        );

        // A cause that the server did not write stays out of the warning.
        let parse = "x".parse::<i32>().expect_err("not a number");
        let raw = command_failure(
            anyhow::Error::from(parse.clone())
                .context("Reading the seat")
                .into(),
            command,
        )
        .unwrap();
        let report = raw.report.expect("reported failure");
        assert_eq!(report.code, crate::errors::INTERNAL_OPERATION_FAILED);
        assert!(!raw.alert);
        assert!(!raw.warning.contains(&parse.to_string()) && !raw.warning.contains("seat"));

        let storage = command_failure(sqlx::Error::PoolClosed.into(), command).unwrap();
        assert!(storage.alert && storage.report.is_some());
        assert!(!storage.warning.contains("PoolClosed"));

        // Storage reports a fault as the error's context, which the conversion keeps.
        let fault =
            anyhow::Error::from(sqlx::Error::PoolClosed).context(crate::errors::Fault::new(
                "persistence_uncertain",
                "The write may have been saved.",
                StatusCode::SERVICE_UNAVAILABLE,
            ));
        let CommandError::Unavailable(fault) = CommandError::from(fault) else {
            panic!("A fault was not unavailable");
        };
        assert_eq!(fault.code, "persistence_uncertain");
        let unavailable = command_failure(CommandError::Unavailable(fault), command).unwrap();
        assert!(unavailable.alert && unavailable.report.is_some());
        assert!(
            unavailable
                .warning
                .contains("The write may have been saved.")
        );
    }
}
