use super::{Command, TableActor, setup::options_suggestion};
use crate::errors::CommandResult;
use crate::errors::OrReject;
use crate::{
    lobby::TableChatCommand,
    model::{Phase, TableChat, TableSnapshot},
    transport::{Session, frame},
};
use anyhow::Result;
use chrono::{Duration as ChronoDuration, Utc};
use hanabi_protocol::{
    Chat, ChatSource, ClientMessage, MAX_PLAYERS, MIN_PLAYERS, SECONDS_PER_MINUTE, Status, TableId,
    TableRequest,
};
use std::{
    cmp::Ordering,
    collections::HashSet,
    sync::Arc,
    time::{Duration, Instant},
};

/// How long a typing indicator lasts without another keystroke.
const TYPING_TIMEOUT: Duration = Duration::from_millis(hanabi_protocol::TYPING_TIMEOUT_MS);
/// The longest countdown `/startin` can set, in minutes.
const MAX_START_IN_MINUTES: f64 = 10.0;
/// The fewest players for the Impostor command, which needs more than one other player.
const MIN_IMPOSTOR_PLAYERS: usize = MIN_PLAYERS + 1;

pub(super) fn server_chat(id: TableId, message: &str) -> Chat {
    Chat {
        who: Some("Hanab Live".into()),
        room: Some(format!("table{id}")),
        ..Chat::new(message, ChatSource::Server, chat_time())
    }
}
pub(super) fn authored_chat(id: TableId, name: &str, message: &str) -> Chat {
    Chat {
        who: Some(name.into()),
        room: Some(format!("table{id}")),
        ..Chat::new(
            crate::accounts::escape_html(message),
            ChatSource::User,
            chat_time(),
        )
    }
}
pub(super) fn chat_time() -> String {
    crate::model::timestamp(Utc::now())
}

/// The most table chat messages one player can send per `TABLE_CHAT_WINDOW`.
pub(super) const TABLE_CHAT_LIMIT: usize = 30;
pub(super) const TABLE_CHAT_WINDOW: Duration = Duration::from_mins(1);
/// Players can fill only part of a table's chat, so server notices and the game still fit in its
/// checkpoint.
pub(super) const MAX_PLAYER_CHAT_MESSAGES: usize = crate::model::MAX_TABLE_CHAT / 2;
pub(super) const MAX_PLAYER_CHAT_BYTES: usize = crate::state::MAX_CHECKPOINT_BYTES / 2;

/// Whether players can add to a table's chat. One message or command can go past the budget.
pub(super) fn player_chat_has_room(chat: &[TableChat]) -> CommandResult<bool> {
    Ok(chat.len() < MAX_PLAYER_CHAT_MESSAGES
        && serde_json::to_vec(chat)?.len() < MAX_PLAYER_CHAT_BYTES)
}

pub(super) fn membership_notice(table: &mut TableSnapshot, text: &str) -> Option<Chat> {
    if table.chat.len() >= crate::model::MAX_TABLE_CHAT {
        eprintln!(
            "Table {} membership notice omitted: chat history is full.",
            table.id
        );
        return None;
    }
    let message = server_chat(table.id, text);
    table.chat.push(TableChat {
        id: None,
        user: 0,
        message: message.clone(),
    });
    Some(message)
}

/// Converts a float that validation has already bounded to an integer, dropping any fraction.
#[expect(
    clippy::cast_possible_truncation,
    reason = "callers pass floats that validation bounds"
)]
pub(super) fn truncate(value: f64) -> i64 {
    value as i64
}
pub(super) fn is_variant_discovery(command: &Command) -> bool {
    let Command::Client(message) = command else {
        return false;
    };
    let ClientMessage::Chat(request) = &**message else {
        return false;
    };
    crate::accounts::normalize_chat(&request.msg).is_ok_and(|text| {
        text.split_whitespace()
            .next()
            .and_then(|word| word.strip_prefix('/'))
            .and_then(|name| TableChatCommand::parse(&name.to_ascii_lowercase()))
            == Some(TableChatCommand::FindVariant)
    })
}
pub(super) struct VariantDiscovery {
    pub(super) requester: Arc<Session>,
    pub(super) participants: Vec<(i32, String)>,
    pub(super) query: std::pin::Pin<Box<dyn Future<Output = Result<Option<String>>> + Send>>,
}

impl TableActor {
    /// The users whose scores the score commands compare: everyone watching a replay, or the
    /// table's players.
    fn score_participants(&self) -> CommandResult<Vec<(i32, String)>> {
        let participants = if matches!(self.table.phase, Phase::Replay { .. }) {
            self.audience()
                .map(|a| (a.session.user, a.session.name.clone()))
                .collect::<Vec<_>>()
        } else {
            self.table
                .players()
                .iter()
                .map(|p| (p.id, p.name.clone()))
                .collect()
        };
        ensure_or_reject!(
            hanabi_protocol::is_player_count(participants.len()),
            "This command requires {MIN_PLAYERS} to {MAX_PLAYERS} participants"
        );
        Ok(participants)
    }
    pub(super) fn prepare_discovery(
        &self,
        requester: Arc<Session>,
    ) -> CommandResult<VariantDiscovery> {
        ensure_or_reject!(
            !self.frozen && self.attending(&requester),
            "You are not at an available table."
        );
        let participants = self.score_participants()?;
        let count = participants.len();
        let ids = participants.iter().map(|(id, _)| *id).collect::<Vec<_>>();
        let store = self.store.clone();
        let query = Box::pin(async move {
            let rows = sqlx::query!(
                r#"SELECT variant_id,CASE $2::smallint WHEN 2 THEN best_score2 WHEN 3 THEN best_score3
                   WHEN 4 THEN best_score4 WHEN 5 THEN best_score5 ELSE best_score6 END AS "score!"
                   FROM user_stats WHERE user_id=ANY($1)"#,
                &ids,
                i16::try_from(count)?,
            )
            .fetch_all(&store.primary)
            .await?;
            let mut completed = HashSet::new();
            for row in rows {
                let id = u32::try_from(row.variant_id)?;
                if i32::from(row.score) == hanabi_engine::get_variant_by_id(id)?.max_score {
                    completed.insert(id);
                }
            }
            let missing = hanabi_engine::variants()
                .iter()
                .filter(|v| !completed.contains(&v.id))
                .collect::<Vec<_>>();
            Ok(if missing.is_empty() {
                None
            } else {
                Some(missing[rand::random_range(0..missing.len())].name.clone())
            })
        });
        Ok(VariantDiscovery {
            requester,
            participants,
            query,
        })
    }
    pub(super) async fn finish_discovery(
        &mut self,
        query: VariantDiscovery,
        selected: Result<Option<String>>,
    ) -> CommandResult<()> {
        ensure_or_reject!(
            !self.frozen && self.attending(&query.requester),
            "Variant requester is no longer at this table."
        );
        let selected = selected?;
        let text=selected.as_ref().map_or_else(||"No missing variants for this team.".to_owned(),|name|
            format!("Here is a random variant that everyone needs the {}-player max score in: {name}",query.participants.len()));
        let message = server_chat(self.table.id, &text);
        let mut next = self.candidate();
        next.chat.push(TableChat {
            id: None,
            user: 0,
            message: message.clone(),
        });
        self.persist(next).await?;
        let mut effects = self.effects();
        self.add_chat(&mut effects, &message);
        if let Some(variant) = selected
            && matches!(self.table.phase, Phase::Pregame { .. })
            && self.table.players().len() == query.participants.len()
            && self
                .table
                .players()
                .iter()
                .all(|player| query.participants.iter().any(|(id, _)| *id == player.id))
            && let Some(owner) = self
                .attendees
                .get(&self.table.owner)
                .filter(|a| self.attending(&a.session))
        {
            let mut options = self.table.options.clone();
            options.variant_name = variant;
            let proposal = options_suggestion(
                self.table.id,
                &owner.session.name,
                &options,
                &self.table.name,
                self.table.max_players,
                &self.table.extra,
            );
            effects.messages.push((
                owner.session.clone(),
                frame(hanabi_protocol::server::CHAT, proposal),
            ));
        }
        self.publish(effects).await
    }
    pub(super) async fn chat_presence(
        &mut self,
        session: Arc<Session>,
        typing: bool,
    ) -> CommandResult<()> {
        ensure_or_reject!(self.attending(&session), "Not attending");
        let a = self.attendees.get_mut(&session.user).expect("attendee");
        let notify = typing && a.typing_until.is_none();
        if typing {
            a.typing_until = Some(Instant::now() + TYPING_TIMEOUT);
        } else {
            self.chat_read.insert(session.user, self.table.chat.len());
        }
        if notify {
            let mut e = self.effects();
            self.typing_messages(&mut e, session.user, &session.name, true);
            self.publish(e).await?;
        }
        Ok(())
    }
    pub(super) async fn chat(&mut self, session: Arc<Session>, msg: &str) -> CommandResult<()> {
        ensure_or_reject!(self.attending(&session), "Not attending");
        let text = crate::accounts::normalize_chat(msg).map_err(anyhow::Error::msg)?;
        // Every message rewrites the table's checkpoint, so its cost grows with the chat.
        if let Err(wait) = self.chat_limit.charge(session.user, Instant::now()) {
            reject!(
                "You are sending messages too quickly. Please wait {} seconds.",
                wait.as_secs().max(1)
            );
        }
        ensure_or_reject!(
            player_chat_has_room(&self.table.chat)?,
            "Chat history is full"
        );
        if let Some(response) = crate::lobby::general_response(&text) {
            let responses = match response {
                crate::lobby::GeneralResponse::Private(response) => {
                    let mut e = self.effects();
                    let mut message = server_chat(self.table.id, &response);
                    message.recipient = Some(session.name.clone());
                    e.messages
                        .push((session, frame(hanabi_protocol::server::CHAT, message)));
                    return self.publish(e).await;
                }
                crate::lobby::GeneralResponse::Public(response) => vec![response],
                crate::lobby::GeneralResponse::Runtime { command, args } => {
                    self.info.runtime_response(&command, &args)?
                }
            };
            let mut messages = vec![authored_chat(self.table.id, &session.name, &text)];
            messages.extend(
                responses
                    .iter()
                    .map(|response| server_chat(self.table.id, response)),
            );
            let mut next = self.candidate();
            ensure_or_reject!(
                next.chat.len() + messages.len() <= crate::model::MAX_TABLE_CHAT,
                "Chat history is full"
            );
            for (index, message) in messages.iter().enumerate() {
                next.chat.push(TableChat {
                    id: None,
                    user: if index == 0 { session.user } else { 0 },
                    message: message.clone(),
                });
            }
            self.persist(next).await?;
            let mut e = self.effects();
            for message in messages {
                self.add_chat(&mut e, &message);
            }
            return self.publish(e).await;
        }
        // Unknown slash commands are ordinary table messages for bots.
        if matches!(
            crate::lobby::classify_chat(&text),
            crate::lobby::Classification::Public | crate::lobby::Classification::Private
        ) {
            return self.chat_command(session, &text).await;
        }
        let message = authored_chat(self.table.id, &session.name, &text);
        let mut next = self.candidate();
        ensure_or_reject!(
            next.chat.len() < crate::model::MAX_TABLE_CHAT,
            "Chat history is full"
        );
        next.chat.push(TableChat {
            id: None,
            user: session.user,
            message: message.clone(),
        });
        self.persist(next).await?;
        let typing = self
            .attendees
            .get_mut(&session.user)
            .is_some_and(|a| a.typing_until.take().is_some());
        let mut e = self.effects();
        self.add_chat(&mut e, &message);
        if typing {
            self.typing_messages(&mut e, session.user, &session.name, false);
        }
        self.publish(e).await
    }
    pub(super) async fn chat_command(
        &mut self,
        session: Arc<Session>,
        text: &str,
    ) -> CommandResult<()> {
        let mut words = text[1..].split_whitespace();
        let command = words.next().unwrap_or("").to_ascii_lowercase();
        let args = words.collect::<Vec<_>>();
        let parsed = TableChatCommand::parse(&command);
        let mut next = self.candidate();
        if parsed == Some(TableChatCommand::MissingScores) {
            let participants = self.score_participants()?;
            let message = format!(
                "{}/shared-missing-scores/{}/{}",
                self.info.public_url(""),
                participants.len(),
                participants
                    .iter()
                    .map(|(_, n)| url::form_urlencoded::byte_serialize(n.as_bytes())
                        .collect::<String>()
                        .replace('+', "%20"))
                    .collect::<Vec<_>>()
                    .join("/")
            );
            let message = server_chat(self.table.id, &message);
            next.chat.push(TableChat {
                id: None,
                user: 0,
                message: message.clone(),
            });
            self.persist(next).await?;
            let mut e = self.effects();
            self.add_chat(&mut e, &message);
            return self.publish(e).await;
        }
        if parsed == Some(TableChatCommand::Tags) {
            let messages = if matches!(self.table.phase, Phase::Replay { .. }) {
                let id = self.table.game().expect("replay game").game_id;
                let tags = crate::archive::tags(&self.store.primary, id)
                    .await?
                    .unwrap_or_default()
                    .into_iter()
                    .map(|t| t.tag)
                    .collect::<std::collections::BTreeSet<_>>();
                if tags.is_empty() {
                    vec!["There are not yet any tags for this game.".to_owned()]
                } else {
                    let mut lines =
                        vec!["The list of tags for this game are as follows:".to_owned()];
                    lines.extend(tags.iter().enumerate().map(|(index, tag)| {
                        format!("{}) {}", index + 1, crate::accounts::escape_html(tag))
                    }));
                    lines
                }
            } else {
                vec!["You can only perform this command while in a replay.".to_owned()]
            };
            ensure_or_reject!(
                self.attending(&session),
                "Tag reader is no longer at this table."
            );
            let messages = messages
                .iter()
                .map(|text| server_chat(self.table.id, text))
                .collect::<Vec<_>>();
            for message in &messages {
                next.chat.push(TableChat {
                    id: None,
                    user: 0,
                    message: message.clone(),
                });
            }
            self.persist(next).await?;
            let mut e = self.effects();
            for message in messages {
                self.add_chat(&mut e, &message);
            }
            return self.publish(e).await;
        }
        if parsed == Some(TableChatCommand::Suggest) {
            ensure_or_reject!(
                matches!(self.table.phase, Phase::Replay { .. }),
                "Not a shared replay"
            );
            ensure_or_reject!(args.len() == 1, "Expected /suggest [turn]");
            return self
                .suggest(
                    session,
                    i64::from(
                        args[0]
                            .parse::<i32>()
                            .or_reject("Expected /suggest [turn]")?,
                    ),
                )
                .await;
        }
        if let Some(TableChatCommand::Split { automatic }) = parsed {
            return self.split(session, &args, automatic).await;
        }
        ensure_or_reject!(
            session.user == self.table.owner,
            "Only the table owner can use that command"
        );
        let Phase::Pregame {
            players,
            automatic_start,
            countdown,
            kicked,
        } = &mut next.phase
        else {
            reject!("This command requires a pregame table");
        };
        let mut boot = None;
        let notice;
        match parsed {
            Some(TableChatCommand::Start(count)) => {
                let n = if let Some(arg) = args.first() {
                    arg.parse::<usize>()
                        .or_reject("Expected /s [number of players]")?
                } else {
                    count.unwrap_or(players.len() + 1)
                };
                ensure_or_reject!(
                    hanabi_protocol::is_player_count(n),
                    "Tables require {MIN_PLAYERS} to {MAX_PLAYERS} players"
                );
                *automatic_start = Some(n);
                *countdown = None;
                notice = format!("The game will start as soon as {n} players have joined.");
            }
            Some(TableChatCommand::StartIn) => {
                ensure_or_reject!(args.len() == 1, "Expected /startin [minutes]");
                let minutes = args[0]
                    .parse::<f64>()
                    .or_reject("Invalid countdown number")?;
                ensure_or_reject!(
                    minutes.is_finite() && minutes > 0.0 && minutes <= MAX_START_IN_MINUTES,
                    "Minutes must be between zero and {MAX_START_IN_MINUTES}"
                );
                let seconds = truncate((minutes * f64::from(SECONDS_PER_MINUTE)).ceil());
                *countdown = Some(Utc::now() + ChronoDuration::seconds(seconds));
                let wait = match seconds.cmp(&i64::from(SECONDS_PER_MINUTE)) {
                    Ordering::Less => format!("{seconds} seconds"),
                    Ordering::Equal => "1 minute".into(),
                    Ordering::Greater => {
                        format!("{} minutes", crate::accounts::escape_html(args[0]))
                    }
                };
                notice = format!("The game will automatically start in {wait}.");
            }
            Some(TableChatCommand::Kick) => {
                ensure_or_reject!(args.len() == 1, "Expected /kick [username]");
                let index = players
                    .iter()
                    .position(|p| {
                        crate::accounts::normalize_string(&p.name)
                            == crate::accounts::normalize_string(args[0])
                    })
                    .or_reject("Player not found")?;
                ensure_or_reject!(
                    players[index].id != session.user,
                    "You cannot kick yourself"
                );
                let player = players.remove(index);
                notice = format!(
                    "Successfully kicked \"{}\" from the game.",
                    crate::accounts::escape_html(&player.name)
                );
                kicked.push(player.id);
                boot = Some(player.id);
                *countdown = None;
            }
            Some(TableChatCommand::Impostor) => {
                ensure_or_reject!(
                    players.len() >= MIN_IMPOSTOR_PLAYERS,
                    "Impostor requires at least {MIN_IMPOSTOR_PLAYERS} players"
                );
                let chosen = rand::random_range(0..players.len());
                let mut e = self.effects();
                for (i, p) in players.iter().enumerate() {
                    if let Some(a) = self.attendees.get(&p.id) {
                        let mut message = server_chat(
                            self.table.id,
                            if i == chosen {
                                "You are an IMPOSTOR."
                            } else {
                                "You are a CREWMATE."
                            },
                        );
                        message.recipient = Some(a.session.name.clone());
                        e.messages.push((
                            a.session.clone(),
                            frame(hanabi_protocol::server::CHAT, message),
                        ));
                    }
                }
                return self.publish(e).await;
            }
            _ => reject!("Unknown table chat command: /{command}"),
        }
        let authored = authored_chat(self.table.id, &session.name, text);
        let notice = server_chat(self.table.id, &notice);
        next.chat.push(TableChat {
            id: None,
            user: session.user,
            message: authored.clone(),
        });
        next.chat.push(TableChat {
            id: None,
            user: 0,
            message: notice.clone(),
        });
        self.persist(next).await?;
        let mut e = self.effects();
        if let Some(user) = boot
            && let Some(a) = self.attendees.remove(&user)
        {
            e.statuses.push((a.session.clone(), Status::Lobby, None));
            e.messages.push((
                a.session,
                frame(
                    hanabi_protocol::server::LEFT,
                    TableRequest {
                        table_id: self.table.id,
                    },
                ),
            ));
        }
        self.pregame_messages(&mut e);
        self.add_chat(&mut e, &authored);
        self.add_chat(&mut e, &notice);
        self.publish(e).await
    }
}
