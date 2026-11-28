use super::{TableActor, pending::Completed, setup::options_suggestion};
use crate::errors::OrReject;
use crate::errors::{CommandError, CommandResult};
use crate::{
    lobby::{ChatCommand, CommandKind, TableChatCommand},
    model::{Phase, TableChat, TableSnapshot},
    transport::{Session, frame},
};
use anyhow::{Context, Result};
use hanabi_protocol::UserId;
use hanabi_protocol::{Chat, ChatAuthor, ChatMessage, MAX_PLAYERS, MIN_PLAYERS, TableId};
use std::{
    collections::HashSet,
    sync::Arc,
    time::{Duration, Instant},
};
use time::OffsetDateTime;

/// How long a typing indicator lasts without another keystroke.
const TYPING_TIMEOUT: Duration =
    Duration::from_millis(hanabi_protocol::TYPING_TIMEOUT_MS.unsigned_abs());
/// The fewest players for the Impostor command, which needs more than one other player.
const MIN_IMPOSTOR_PLAYERS: usize = MIN_PLAYERS + 1;

pub(super) fn server_chat(id: TableId, message: &str) -> Chat {
    table_chat(id, ChatMessage::server(message, chat_time()))
}
/// A message from the server to one user at the table.
pub(super) fn private_server_chat(id: TableId, recipient: &str, message: &str) -> Chat {
    table_chat(
        id,
        ChatMessage::private(message, ChatAuthor::Server {}, recipient, chat_time()),
    )
}
pub(super) fn authored_chat(id: TableId, name: &str, message: &str) -> Chat {
    table_chat(
        id,
        ChatMessage::public(
            message,
            ChatAuthor::User {
                username: name.into(),
            },
            chat_time(),
        ),
    )
}
const fn table_chat(id: TableId, message: ChatMessage) -> Chat {
    Chat {
        table_id: Some(id),
        message,
    }
}
pub(super) fn chat_time() -> hanabi_protocol::Timestamp {
    hanabi_protocol::Timestamp::from(OffsetDateTime::now_utc())
}

/// The most table chat messages one player can send per `TABLE_CHAT_WINDOW`.
pub(super) const TABLE_CHAT_LIMIT: usize = 30;
pub(super) const TABLE_CHAT_WINDOW: Duration = Duration::from_mins(1);
/// A table keeps only its newest chat, within these limits, so that its chat and its game fit in
/// its checkpoint. Older messages stay in `chat_log`.
pub(super) const MAX_KEPT_CHAT_MESSAGES: usize = crate::model::MAX_TABLE_CHAT / 2;
pub(super) const MAX_KEPT_CHAT_BYTES: usize = crate::state::MAX_CHECKPOINT_BYTES / 2;
/// What a table keeps when its chat goes past the limits. Dropping messages rewrites every saved
/// chat message, so a table drops many at once.
pub(super) const TRIMMED_CHAT_MESSAGES: usize = MAX_KEPT_CHAT_MESSAGES / 4 * 3;
const TRIMMED_CHAT_BYTES: usize = MAX_KEPT_CHAT_BYTES / 4 * 3;

/// The serialized size of a table's chat. Messages are only added at the end of the chat, so this
/// measures each message once, instead of the whole chat for every new message.
#[derive(Default)]
pub(super) struct ChatBytes {
    /// The messages measured so far.
    counted: usize,
    bytes: usize,
}

impl ChatBytes {
    /// The serialized size of `chat`. A save gives each new message an archive ID after it was
    /// measured; those few bytes are not counted.
    fn of(&mut self, chat: &[TableChat]) -> Result<usize> {
        if chat.len() < self.counted {
            *self = Self::default();
        }
        for message in &chat[self.counted..] {
            self.bytes += serde_json::to_vec(message)?.len();
        }
        self.counted = chat.len();
        Ok(self.bytes)
    }
    /// Drops the oldest messages of `chat` when it is past `MAX_KEPT_CHAT_MESSAGES` or
    /// `MAX_KEPT_CHAT_BYTES`, until it is within `TRIMMED_CHAT_MESSAGES` and `TRIMMED_CHAT_BYTES`.
    /// Keeps messages that `chat_log` does not hold yet. Returns how many messages it dropped.
    pub(super) fn trim(&mut self, chat: &mut Vec<TableChat>) -> Result<usize> {
        let mut bytes = self.of(chat)?;
        if chat.len() <= MAX_KEPT_CHAT_MESSAGES && bytes <= MAX_KEPT_CHAT_BYTES {
            return Ok(0);
        }
        let mut dropped = 0;
        while chat[dropped..]
            .first()
            .is_some_and(|chat| chat.id.is_some())
            && (chat.len() - dropped > TRIMMED_CHAT_MESSAGES || bytes > TRIMMED_CHAT_BYTES)
        {
            bytes -= serde_json::to_vec(&chat[dropped])?.len();
            dropped += 1;
        }
        chat.drain(..dropped);
        *self = Self {
            counted: chat.len(),
            bytes,
        };
        Ok(dropped)
    }
}

/// Adds messages to a table's chat, each with its author. If they do not all fit in
/// `MAX_TABLE_CHAT`, adds none and rejects the command. Every addition to a table's chat goes
/// through here.
pub(super) fn push_chat(
    table: &mut TableSnapshot,
    messages: impl IntoIterator<Item = (Option<UserId>, Chat)>,
) -> CommandResult<()> {
    let messages = messages.into_iter().collect::<Vec<_>>();
    ensure_or_reject!(
        table.chat.len() + messages.len() <= crate::model::MAX_TABLE_CHAT,
        "Chat history is full."
    );
    table
        .chat
        .extend(messages.into_iter().map(|(user, message)| TableChat {
            id: None,
            user,
            message,
        }));
    Ok(())
}

/// Adds a server notice to a table's chat and returns it, unless the chat history is full. Use it
/// for a notice about a change that must happen even when the notice does not fit.
pub(super) fn table_notice(table: &mut TableSnapshot, text: &str) -> Option<Chat> {
    let message = server_chat(table.id, text);
    if push_chat(table, [(None, message.clone())]).is_err() {
        tracing::warn!("Table {} notice omitted: chat history is full.", table.id);
        return None;
    }
    Some(message)
}

/// Whether a table chat message asks for a variant search.
pub(super) fn is_variant_discovery(message: &str) -> bool {
    crate::accounts::normalize_chat(message).is_ok_and(|text| {
        ChatCommand::parse(&text).is_some_and(|command| {
            matches!(
                command.kind,
                CommandKind::Table(TableChatCommand::FindVariant)
            )
        })
    })
}
/// A variant search: who asked, and whose scores it compares.
pub(super) struct VariantDiscovery {
    pub(super) requester: Arc<Session>,
    pub(super) participants: Vec<(UserId, String)>,
}

impl TableActor {
    /// Charges a player for a message that they cause in the table's chat. Every message rewrites
    /// the table's checkpoint, so its cost grows with the chat.
    pub(super) fn charge_chat(&mut self, user: UserId) -> CommandResult<()> {
        if let Err(wait) = self.chat_limit.charge(user.get(), Instant::now()) {
            reject!("{}", crate::lobby::too_quickly(wait));
        }
        Ok(())
    }
    /// The reply to `/seed` or `/id`.
    fn game_detail(&self, command: TableChatCommand) -> String {
        let Some(game) = self.table.game() else {
            return "The game has not started yet.".into();
        };
        let live = matches!(self.table.phase, Phase::Live { .. });
        if command == TableChatCommand::Seed {
            // The seed finds other games on the same deck, so a live game keeps it hidden.
            if live {
                return "This game shows its seed when it ends.".into();
            }
            return game.seed.as_ref().map_or_else(
                || "This game has no seed, because it has a custom deck.".into(),
                |seed| format!("Seed: {seed}"),
            );
        }
        if live {
            return "This game gets an ID when it ends.".into();
        }
        game.game_id.map_or_else(
            || "This game has no ID, because it is not in the database.".into(),
            |id| format!("Game ID: {id}"),
        )
    }
    /// The users whose scores the score commands compare: everyone watching a replay, or the
    /// table's players.
    fn score_participants(&self) -> CommandResult<Vec<(UserId, String)>> {
        let participants = if matches!(self.table.phase, Phase::Replay { .. }) {
            self.audience()
                .map(|a| (a.session.user, a.session.name.clone()))
                .collect::<Vec<_>>()
        } else {
            self.table
                .players()
                .iter()
                .filter_map(|p| Some((p.id?, p.name.clone())))
                .collect()
        };
        ensure_or_reject!(
            hanabi_protocol::is_player_count(participants.len()),
            "This command requires {MIN_PLAYERS} to {MAX_PLAYERS} participants."
        );
        Ok(participants)
    }
    /// Starts a variant search. Returns the query that picks the variant; `finish_discovery`
    /// posts its result.
    pub(super) fn start_discovery(
        &mut self,
        requester: Arc<Session>,
    ) -> CommandResult<impl Future<Output = Completed> + Send + 'static> {
        ensure_or_reject!(
            !self.discovering,
            "A variant search is already pending at this table."
        );
        ensure_or_reject!(
            self.attending(&requester),
            "You are not at an available table."
        );
        let participants = self.score_participants()?;
        self.charge_chat(requester.user)?;
        let count = participants.len();
        let ids = participants
            .iter()
            .map(|(id, _)| id.get())
            .collect::<Vec<_>>();
        let store = self.store.clone();
        let query = async move {
            let rows = sqlx::query!(
                r#"SELECT variant_id,CASE $2::smallint WHEN 2 THEN best_score2 WHEN 3 THEN best_score3
                   WHEN 4 THEN best_score4 WHEN 5 THEN best_score5 ELSE best_score6 END AS score
                   FROM user_stats WHERE user_id=ANY($1)"#,
                &ids,
                i16::try_from(count)?,
            )
            .fetch_all(&store.primary)
            .await?;
            let mut completed = HashSet::new();
            for row in rows {
                let id = u32::try_from(row.variant_id)?;
                if row.score.map(i32::from) == Some(hanabi_engine::get_variant_by_id(id)?.max_score)
                {
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
        };
        self.discovering = true;
        let discovery = VariantDiscovery {
            requester,
            participants,
        };
        Ok(async move {
            Completed::Discovery {
                discovery,
                selected: query.await,
            }
        })
    }
    /// Tells the table which achievements its game unlocked, in a chat message for each, and
    /// tells each player who is still at the table about theirs.
    pub(super) async fn announce_achievements(
        &mut self,
        unlocked: &[crate::achievements::Unlocked],
        names: &std::collections::HashMap<i32, String>,
    ) -> CommandResult<()> {
        if unlocked.is_empty() {
            return Ok(());
        }
        let messages: Vec<_> = unlocked
            .iter()
            .filter_map(|u| {
                let name = names.get(&u.user)?;
                Some(server_chat(
                    self.table.id,
                    &format!("{name} unlocked an achievement: {}", u.achievement.name),
                ))
            })
            .collect();
        let mut next = self.candidate();
        push_chat(&mut next, messages.iter().map(|m| (None, m.clone())))?;
        self.persist(next).await?;
        let mut e = self.effects();
        for message in &messages {
            self.add_chat(&mut e, message);
        }
        for u in unlocked {
            let Some(attendee) = UserId::new(u.user).and_then(|user| self.attendees.get(&user))
            else {
                continue;
            };
            e.messages.push((
                attendee.session.clone(),
                frame(
                    hanabi_protocol::event::ACHIEVEMENT_UNLOCKED,
                    hanabi_protocol::AchievementUnlocked {
                        id: u.achievement.id,
                        name: u.achievement.name.into(),
                        description: u.achievement.description(),
                    },
                ),
            ));
        }
        self.publish(e).await
    }
    pub(super) async fn finish_discovery(
        &mut self,
        query: VariantDiscovery,
        selected: Result<Option<String>>,
    ) -> CommandResult<()> {
        ensure_or_reject!(
            self.attending(&query.requester),
            "Variant requester is no longer at this table."
        );
        let selected = selected?;
        let text=selected.as_ref().map_or_else(||"No missing variants for this team.".to_owned(),|name|
            format!("Here is a random variant that everyone needs the {}-player max score in: {name}",query.participants.len()));
        let message = server_chat(self.table.id, &text);
        let mut next = self.candidate();
        push_chat(&mut next, [(None, message.clone())])?;
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
                .all(|player| query.participants.iter().any(|(id, _)| player.is(*id)))
            && let Some(owner) = self
                .attendees
                .get(&self.table.owner.user_id)
                .filter(|a| self.attending(&a.session))
        {
            let mut options = self.table.options.clone();
            options.variant_name = variant;
            let proposal = options_suggestion(
                self.table.id,
                &options,
                &self.table.name,
                self.table.max_players,
                &self.table.extra,
            );
            effects.messages.push((
                owner.session.clone(),
                frame(hanabi_protocol::event::TABLE_SETTINGS_SUGGESTION, proposal),
            ));
        }
        self.publish(effects).await
    }
    pub(super) async fn chat_presence(
        &mut self,
        session: Arc<Session>,
        typing: bool,
    ) -> CommandResult<()> {
        let a = self.attendance_mut(&session).or_reject("Not attending.")?;
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
        ensure_or_reject!(self.attending(&session), "Not attending.");
        let text = crate::accounts::normalize_chat(msg).map_err(CommandError::rejected)?;
        self.charge_chat(session.user)?;
        let command = ChatCommand::parse(&text);
        if let Some(response) = command.as_ref().and_then(ChatCommand::general_response) {
            let responses = match response {
                crate::lobby::GeneralResponse::Private(response) => {
                    let mut e = self.effects();
                    let message = private_server_chat(self.table.id, &session.name, &response);
                    e.messages
                        .push((session, frame(hanabi_protocol::event::CHAT, message)));
                    return self.publish(e).await;
                }
                crate::lobby::GeneralResponse::Public(response) => vec![response],
                crate::lobby::GeneralResponse::Runtime { command, args } => {
                    self.info.runtime_response(command, &args)
                }
            };
            let mut messages = vec![authored_chat(self.table.id, &session.name, &text)];
            messages.extend(
                responses
                    .iter()
                    .map(|response| server_chat(self.table.id, response)),
            );
            let mut next = self.candidate();
            push_chat(
                &mut next,
                messages.iter().enumerate().map(|(index, message)| {
                    let author = (index == 0).then_some(session.user);
                    (author, message.clone())
                }),
            )?;
            self.persist(next).await?;
            let mut e = self.effects();
            for message in messages {
                self.add_chat(&mut e, &message);
            }
            return self.publish(e).await;
        }
        if let Some(ChatCommand {
            kind: CommandKind::Table(table_command),
            args,
            ..
        }) = &command
        {
            return self
                .chat_command(session, &text, *table_command, args)
                .await;
        }
        // Only its sender sees an unknown command. Bots read commands that start with another
        // character, such as "!setall".
        if let Some(command) = command
            .as_ref()
            .filter(|command| matches!(command.kind, CommandKind::Unknown))
        {
            let message =
                private_server_chat(self.table.id, &session.name, &command.invalid_response());
            let mut e = self.effects();
            e.messages
                .push((session, frame(hanabi_protocol::event::CHAT, message)));
            return self.publish(e).await;
        }
        let message = authored_chat(self.table.id, &session.name, &text);
        let mut next = self.candidate();
        push_chat(&mut next, [(Some(session.user), message.clone())])?;
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
        command: TableChatCommand,
        args: &[&str],
    ) -> CommandResult<()> {
        if matches!(command, TableChatCommand::Seed | TableChatCommand::Id) {
            let reply = self.game_detail(command);
            let message = private_server_chat(self.table.id, &session.name, &reply);
            let mut e = self.effects();
            e.messages
                .push((session, frame(hanabi_protocol::event::CHAT, message)));
            return self.publish(e).await;
        }
        let mut next = self.candidate();
        if command == TableChatCommand::MissingScores {
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
            push_chat(&mut next, [(None, message.clone())])?;
            self.persist(next).await?;
            let mut e = self.effects();
            self.add_chat(&mut e, &message);
            return self.publish(e).await;
        }
        if command == TableChatCommand::Tags {
            let messages = if matches!(self.table.phase, Phase::Replay { .. }) {
                let id = self
                    .table
                    .game()
                    .context("A replay command ran without a game")?
                    .game_id;
                // A replay of uploaded JSON has no game in the database, so it has no tags.
                let tags = match id {
                    Some(id) => crate::archive::tags(&self.store.primary, id)
                        .await?
                        .unwrap_or_default(),
                    None => vec![],
                };
                let tags = tags
                    .into_iter()
                    .map(|t| t.tag)
                    .collect::<std::collections::BTreeSet<_>>();
                if tags.is_empty() {
                    vec!["There are not yet any tags for this game.".to_owned()]
                } else {
                    let mut lines =
                        vec!["The list of tags for this game are as follows:".to_owned()];
                    lines.extend(
                        tags.iter()
                            .enumerate()
                            .map(|(index, tag)| format!("{}) {}", index + 1, tag)),
                    );
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
            push_chat(
                &mut next,
                messages.iter().map(|message| (None, message.clone())),
            )?;
            self.persist(next).await?;
            let mut e = self.effects();
            for message in messages {
                self.add_chat(&mut e, &message);
            }
            return self.publish(e).await;
        }
        if let TableChatCommand::Split { automatic } = command {
            return self.split(session, args, automatic).await;
        }
        ensure_or_reject!(
            session.user == self.table.owner.user_id,
            "Only the table owner can use that command."
        );
        let Phase::Pregame {
            players, kicked, ..
        } = &mut next.phase
        else {
            reject!("This command requires a pregame table.");
        };
        let (notice, kicked_user) = match command {
            TableChatCommand::Kick => {
                ensure_or_reject!(args.len() == 1, "Expected /kick [username].");
                let index = players
                    .iter()
                    .position(|p| {
                        crate::accounts::normalize_string(&p.name)
                            == crate::accounts::normalize_string(args[0])
                    })
                    .or_reject("Player not found.")?;
                ensure_or_reject!(
                    !players[index].is(session.user),
                    "You cannot kick yourself."
                );
                let player = players.remove(index);
                let user = player.user()?;
                kicked.push(user);
                // Otherwise, the table would restore them as a spectator when they reconnect.
                next.shadows.remove(&user);
                (
                    format!("Successfully kicked \"{}\" from the game.", player.name),
                    user,
                )
            }
            TableChatCommand::Impostor => {
                ensure_or_reject!(
                    players.len() >= MIN_IMPOSTOR_PLAYERS,
                    "Impostor requires at least {MIN_IMPOSTOR_PLAYERS} players."
                );
                let chosen = rand::random_range(0..players.len());
                let mut e = self.effects();
                for (i, p) in players.iter().enumerate() {
                    if let Some(a) = p.id.and_then(|id| self.attendees.get(&id)) {
                        let message = private_server_chat(
                            self.table.id,
                            &a.session.name,
                            if i == chosen {
                                "You are an IMPOSTOR."
                            } else {
                                "You are a CREWMATE."
                            },
                        );
                        e.messages.push((
                            a.session.clone(),
                            frame(hanabi_protocol::event::CHAT, message),
                        ));
                    }
                }
                return self.publish(e).await;
            }
            // The table runs the variant search before its chat.
            _ => bail_internal!("The table chat got an unexpected command: {command:?}"),
        };
        let authored = authored_chat(self.table.id, &session.name, text);
        let notice = server_chat(self.table.id, &notice);
        push_chat(
            &mut next,
            [
                (Some(session.user), authored.clone()),
                (None, notice.clone()),
            ],
        )?;
        self.persist(next).await?;
        let mut e = self.effects();
        if let Some(a) = self.attendees.remove(&kicked_user) {
            self.credit_review([&a], Instant::now());
            self.departed_typing_messages(&mut e, &a);
            e.leave(a.session);
        }
        self.pregame_messages(&mut e);
        self.add_chat(&mut e, &authored);
        self.add_chat(&mut e, &notice);
        self.publish(e).await
    }
}
