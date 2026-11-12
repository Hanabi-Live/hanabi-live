//! Each user's lobby commands, which one task runs one at a time for every connection that the
//! user has. A connection tells the task its generation when it registers, so the task refuses a
//! command from a replaced connection before the command writes anything.

use super::App;
use crate::{errors::CommandResult, transport::Session};
use hanabi_protocol::{ClientMessage, UserId};
use std::{
    collections::HashMap,
    sync::{Arc, Mutex, PoisonError},
};
use tokio::sync::{mpsc, oneshot};

/// The commands a user's task queues before senders wait.
const USER_QUEUE: usize = 16;

pub(super) enum UserCommand {
    /// A connection registered. Commands from connections with an earlier generation are refused.
    Current(u64),
    /// A lobby command.
    Lobby {
        session: Arc<Session>,
        message: Box<ClientMessage>,
        reply: oneshot::Sender<CommandResult<super::dispatch::LobbyOutcome>>,
    },
}

/// The users' tasks, by user. Each connection holds a sender to its user's task, which stops once
/// every connection of its user has closed.
#[derive(Default)]
pub(super) struct Users(Mutex<HashMap<UserId, mpsc::WeakSender<UserCommand>>>);

impl Users {
    /// The task of `user`, which starts if the user has none.
    pub(super) fn task(&self, app: &Arc<App>, user: UserId) -> mpsc::Sender<UserCommand> {
        let mut users = self.0.lock().unwrap_or_else(PoisonError::into_inner);
        if let Some(sender) = users.get(&user).and_then(mpsc::WeakSender::upgrade) {
            return sender;
        }
        users.retain(|_, task| task.strong_count() > 0);
        let (sender, receiver) = mpsc::channel(USER_QUEUE);
        users.insert(user, sender.downgrade());
        app.connections.spawn(run(app.clone(), receiver));
        sender
    }
}

async fn run(app: Arc<App>, mut receiver: mpsc::Receiver<UserCommand>) {
    let mut current = 0;
    while let Some(command) = receiver.recv().await {
        match command {
            UserCommand::Current(generation) => current = current.max(generation),
            UserCommand::Lobby {
                session,
                message,
                reply,
            } => {
                let result = if session.generation < current || !session.active() {
                    Err(rejection!(
                        "This session was replaced or disconnected. Reconnect before sending commands."
                    ))
                } else {
                    super::dispatch::lobby_command(&app, session, *message).await
                };
                let _ = reply.send(result);
            }
        }
    }
}
