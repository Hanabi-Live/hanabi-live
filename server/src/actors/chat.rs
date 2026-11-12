use super::{Status, TableActor, pending::Completed, setup::options_suggestion};
use crate::errors::OrReject;
use crate::errors::{CommandError, CommandResult};
use crate::{
    lobby::TableChatCommand,
    model::{Phase, TableChat, TableSnapshot},
    transport::{Session, frame},
};
use anyhow::{Context, Result};
use chrono::Utc;
use hanabi_protocol::UserId;
use hanabi_protocol::{Chat, ChatAuthor, MAX_PLAYERS, MIN_PLAYERS, TableId, TableRef};
use std::{
    collections::HashSet,
    sync::Arc,
    time::{Duration, Instant},
};

/// How long a typing indicator lasts without another keystroke.
const TYPING_TIMEOUT: Duration =
    Duration::from_millis(hanabi_protocol::TYPING_TIMEOUT_MS.unsigned_abs());
/// The fewest players for the Impostor command, which needs more than one other player.
const MIN_IMPOSTOR_PLAYERS: usize = MIN_PLAYERS + 1;

pub(super) fn server_chat(id: TableId, message: &str) -> Chat {
    Chat {
        table_id: Some(id),
        ..Chat::server(message, chat_time())
    }
}
/// A message from the server to one user at the table.
pub(super) fn private_server_chat(id: TableId, recipient: &str, message: &str) -> Chat {
    Chat {
        table_id: Some(id),
        ..Chat::private(message, ChatAuthor::Server {}, recipient, chat_time())
    }
}
pub(super) fn authored_chat(id: TableId, name: &str, message: &str) -> Chat {
    Chat {
        table_id: Some(id),
        ..Chat::public(
            crate::accounts::escape_html(message),
            ChatAuthor::User {
                username: name.into(),
            },
            chat_time(),
        )
    }
}
pub(super) fn chat_time() -> hanabi_protocol::Timestamp {
    hanabi_protocol::Timestamp::from(Utc::now())
}

/// The most table chat messages one player can send per `TABLE_CHAT_WINDOW`.
pub(super) const TABLE_CHAT_LIMIT: usize = 30;
pub(super) const TABLE_CHAT_WINDOW: Duration = Duration::from_mins(1);
/// Players can fill only part of a table's chat, so server notices and the game still fit in its
/// checkpoint.
pub(super) const MAX_PLAYER_CHAT_MESSAGES: usize = crate::model::MAX_TABLE_CHAT / 2;
pub(super) const MAX_PLAYER_CHAT_BYTES: usize = crate::state::MAX_CHECKPOINT_BYTES / 2;

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
    /// Whether players can add to `chat`. One message or command can go past the budget.
    pub(super) fn player_room(&mut self, chat: &[TableChat]) -> Result<bool> {
        Ok(chat.len() < MAX_PLAYER_CHAT_MESSAGES && self.of(chat)? < MAX_PLAYER_CHAT_BYTES)
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
        "Chat history is full"
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
        text.split_whitespace()
            .next()
            .and_then(|word| word.strip_prefix('/'))
            .and_then(|name| TableChatCommand::parse(&name.to_ascii_lowercase()))
            == Some(TableChatCommand::FindVariant)
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
            reject!(
                "You are sending messages too quickly. Please wait {} seconds.",
                wait.as_secs().max(1)
            );
        }
        Ok(())
    }
    /// Admits a message that a player adds to the table's chat: charges the player, and checks
    /// that players' messages still have room.
    pub(super) fn admit_player_chat(&mut self, user: UserId) -> CommandResult<()> {
        self.charge_chat(user)?;
        ensure_or_reject!(
            self.chat_bytes.player_room(&self.table.chat)?,
            "Chat history is full"
        );
        Ok(())
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
            "This command requires {MIN_PLAYERS} to {MAX_PLAYERS} participants"
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
        self.admit_player_chat(requester.user)?;
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
        let text = crate::accounts::normalize_chat(msg).map_err(CommandError::rejected)?;
        self.admit_player_chat(session.user)?;
        if let Some(response) = crate::lobby::general_response(&text) {
            let responses = match response {
                crate::lobby::GeneralResponse::Private(response) => {
                    let mut e = self.effects();
                    let message = private_server_chat(self.table.id, &session.name, &response);
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
        // Unknown slash commands are ordinary table messages for bots.
        if matches!(
            crate::lobby::classify_chat(&text),
            crate::lobby::Classification::Public | crate::lobby::Classification::Private
        ) {
            return self.chat_command(session, &text).await;
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
            push_chat(&mut next, [(None, message.clone())])?;
            self.persist(next).await?;
            let mut e = self.effects();
            self.add_chat(&mut e, &message);
            return self.publish(e).await;
        }
        if parsed == Some(TableChatCommand::Tags) {
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
        if parsed == Some(TableChatCommand::Suggest) {
            ensure_or_reject!(
                matches!(self.table.phase, Phase::Replay { .. }),
                "Not a shared replay"
            );
            ensure_or_reject!(args.len() == 1, "Expected /suggest [turn]");
            return self
                .suggest(
                    session,
                    args[0]
                        .parse::<usize>()
                        .ok()
                        .and_then(hanabi_protocol::Turn::new)
                        .or_reject("Expected /suggest [turn]")?,
                )
                .await;
        }
        if let Some(TableChatCommand::Split { automatic }) = parsed {
            return self.split(session, &args, automatic).await;
        }
        ensure_or_reject!(
            session.user == self.table.owner.user_id,
            "Only the table owner can use that command"
        );
        let Phase::Pregame {
            players, kicked, ..
        } = &mut next.phase
        else {
            reject!("This command requires a pregame table");
        };
        let (notice, kicked_user) = match parsed {
            Some(TableChatCommand::Kick) => {
                ensure_or_reject!(args.len() == 1, "Expected /kick [username]");
                let index = players
                    .iter()
                    .position(|p| {
                        crate::accounts::normalize_string(&p.name)
                            == crate::accounts::normalize_string(args[0])
                    })
                    .or_reject("Player not found")?;
                ensure_or_reject!(!players[index].is(session.user), "You cannot kick yourself");
                let player = players.remove(index);
                let user = player.user()?;
                kicked.push(user);
                (
                    format!(
                        "Successfully kicked \"{}\" from the game.",
                        crate::accounts::escape_html(&player.name)
                    ),
                    user,
                )
            }
            Some(TableChatCommand::Impostor) => {
                ensure_or_reject!(
                    players.len() >= MIN_IMPOSTOR_PLAYERS,
                    "Impostor requires at least {MIN_IMPOSTOR_PLAYERS} players"
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
                            frame(hanabi_protocol::server::CHAT, message),
                        ));
                    }
                }
                return self.publish(e).await;
            }
            _ => reject!("Unknown table chat command: /{command}"),
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
            e.statuses.push((a.session.clone(), Status::Lobby, None));
            e.messages.push((
                a.session,
                frame(
                    hanabi_protocol::server::TABLE_LEFT,
                    TableRef {
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
