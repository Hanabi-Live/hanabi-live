use super::{Command, TableActor, setup::options_suggestion};
use crate::{
    model::{Phase, TableChat, TableSnapshot},
    transport::{Session, frame},
};
use anyhow::{Context, Result, bail, ensure};
use chrono::{Duration as ChronoDuration, Utc};
use hanabi_protocol::{
    Chat, ChatSource, ClientMessage, MAX_PLAYERS, MIN_PLAYERS, SECONDS_PER_MINUTE, Status, TableId,
    TableRequest,
};
use serde_json::json;
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
/// The bits of an `f64` mantissa, including its implicit leading bit.
const FLOAT_MANTISSA_BITS: i32 = f64::MANTISSA_DIGITS.cast_signed();
/// The power of two of the smallest positive subnormal `f64`.
const FLOAT_MIN_EXPONENT: i32 = f64::MIN_EXP - FLOAT_MANTISSA_BITS;
/// The prefix of a hexadecimal float.
const HEX_PREFIX: &str = "0x";
const HEX_RADIX: u32 = 16;
/// The binary digits that one hexadecimal digit holds.
const HEX_DIGIT_BITS: u32 = HEX_RADIX.trailing_zeros();
/// The fewest players for the Impostor command, which needs more than one other player.
const MIN_IMPOSTOR_PLAYERS: usize = MIN_PLAYERS + 1;

pub(super) fn server_chat(id: u64, message: &str) -> Chat {
    Chat {
        who: Some("Hanab Live".into()),
        room: Some(if id == 0 {
            "lobby".into()
        } else {
            format!("table{id}")
        }),
        ..Chat::new(message, ChatSource::Server, chat_time())
    }
}
pub(super) fn authored_chat(id: u64, name: &str, message: &str) -> Chat {
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
pub(super) fn player_chat_has_room(chat: &[TableChat]) -> Result<bool> {
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
        message: json!(message),
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
#[expect(
    clippy::cast_precision_loss,
    reason = "the parsed mantissa is rounded to an `f64`'s precision before it becomes a float"
)]
pub(super) fn parse_start_minutes(argument: &str) -> Option<f64> {
    let value = format!("0{argument}");
    if regex!(r"(?i)^\d(?:_?\d)*(?:\.(?:\d(?:_?\d)*)?)?(?:e[+-]?\d(?:_?\d)*)?$").is_match(&value) {
        let value = value.replace('_', "").parse::<f64>().ok()?;
        return value.is_finite().then_some(value);
    }
    if !regex!(r"(?i)^0x_?(?:[0-9a-f](?:_?[0-9a-f])*(?:\.(?:[0-9a-f](?:_?[0-9a-f])*)?)?|\.[0-9a-f](?:_?[0-9a-f])*)p[+-]?\d(?:_?\d)*$").is_match(&value) {
        return None;
    }
    let cleaned = value.replace('_', "").to_ascii_lowercase();
    let (mantissa, power) = cleaned[HEX_PREFIX.len()..].split_once('p')?;
    let fraction = mantissa
        .split_once('.')
        .map_or(0, |(_, fraction)| fraction.len());
    let power = power.parse::<i64>().unwrap_or_else(|_| {
        if power.starts_with('-') {
            i64::MIN
        } else {
            i64::MAX
        }
    });
    let exponent = power.saturating_sub(
        i64::try_from(fraction)
            .unwrap_or(i64::MAX)
            .saturating_mul(i64::from(HEX_DIGIT_BITS)),
    );
    let mut bits = Vec::new();
    for digit in mantissa.chars().filter(|c| *c != '.') {
        let value = digit.to_digit(HEX_RADIX)?;
        for bit in (0..HEX_DIGIT_BITS).rev() {
            bits.push((value >> bit) & 1);
        }
    }
    let Some(first) = bits.iter().position(|b| *b != 0) else {
        return Some(0.0);
    };
    let bits = &bits[first..];
    let size = i64::try_from(bits.len()).ok()?;
    let min_exponent = i64::from(FLOAT_MIN_EXPONENT);
    if exponent.saturating_add(size) < min_exponent {
        return Some(0.0);
    }
    if exponent.saturating_add(size) > i64::from(f64::MAX_EXP) {
        return None;
    }
    let shift = 0
        .max(size - i64::from(FLOAT_MANTISSA_BITS))
        .max(min_exponent - exponent);
    let kept = usize::try_from((size - shift).max(0)).ok()?;
    let mut rounded = bits[..kept]
        .iter()
        .fold(0_u64, |v, bit| (v << 1) | u64::from(*bit));
    // Round once, including subnormal results, using guard/sticky bits.
    if bits.get(kept) == Some(&1) && (bits[kept + 1..].contains(&1) || rounded & 1 != 0) {
        rounded += 1;
    }
    let result = rounded as f64 * 2_f64.powi(i32::try_from(exponent + shift).ok()?);
    result.is_finite().then_some(result)
}
pub(super) fn is_variant_discovery(command: &Command) -> bool {
    let Command::Client(message) = command else {
        return false;
    };
    let ClientMessage::Chat(request) = &**message else {
        return false;
    };
    crate::accounts::normalize_chat(&request.msg).is_ok_and(|text| {
        matches!(
            text.split_whitespace()
                .next()
                .unwrap_or("")
                .to_ascii_lowercase()
                .as_str(),
            "/findvariant" | "/find-variant" | "/fv" | "/randomvariant" | "/random-variant"
        )
    })
}
pub(super) struct VariantDiscovery {
    pub(super) requester: Arc<Session>,
    pub(super) participants: Vec<(i32, String)>,
    pub(super) query: std::pin::Pin<Box<dyn Future<Output = Result<Option<String>>> + Send>>,
}

impl TableActor {
    pub(super) fn prepare_discovery(&self, requester: Arc<Session>) -> Result<VariantDiscovery> {
        self.store.check_state()?;
        ensure!(
            !self.frozen && self.attending(&requester),
            "You are not at an available table."
        );
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
        ensure!(
            hanabi_protocol::is_player_count(participants.len()),
            "This command requires {MIN_PLAYERS} to {MAX_PLAYERS} participants"
        );
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
    ) -> Result<()> {
        self.store.check_state()?;
        ensure!(
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
            message: json!(message),
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
                &self.table.extra.set_seed_suffix,
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
    ) -> Result<()> {
        ensure!(self.attending(&session), "Not attending");
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
    pub(super) async fn chat(&mut self, session: Arc<Session>, msg: &str) -> Result<()> {
        ensure!(self.attending(&session), "Not attending");
        let text = crate::accounts::normalize_chat(msg).map_err(anyhow::Error::msg)?;
        // Every message rewrites the table's checkpoint, so its cost grows with the chat.
        if let Err(wait) = self.chat_limit.charge(session.user, Instant::now()) {
            bail!(
                "You are sending messages too quickly. Please wait {} seconds.",
                wait.as_secs().max(1)
            );
        }
        ensure!(
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
            ensure!(
                next.chat.len() + messages.len() <= crate::model::MAX_TABLE_CHAT,
                "Chat history is full"
            );
            for (index, message) in messages.iter().enumerate() {
                next.chat.push(TableChat {
                    id: None,
                    user: if index == 0 { session.user } else { 0 },
                    message: json!(message),
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
        ensure!(
            next.chat.len() < crate::model::MAX_TABLE_CHAT,
            "Chat history is full"
        );
        next.chat.push(TableChat {
            id: None,
            user: session.user,
            message: json!(message),
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
    pub(super) async fn chat_command(&mut self, session: Arc<Session>, text: &str) -> Result<()> {
        let mut words = text[1..].split_whitespace();
        let command = words.next().unwrap_or("").to_ascii_lowercase();
        let args = words.collect::<Vec<_>>();
        let mut next = self.candidate();
        if [
            "m",
            "missing",
            "missing-scores",
            "missingscores",
            "shared-missing-scores",
            "sharedmissingscores",
        ]
        .contains(&command.as_str())
        {
            let participants = if matches!(self.table.phase, Phase::Replay { .. }) {
                self.audience()
                    .map(|a| (a.session.user, a.session.name.clone()))
                    .collect::<Vec<_>>()
            } else {
                self.table
                    .players()
                    .iter()
                    .map(|p| (p.id, p.name.clone()))
                    .collect::<Vec<_>>()
            };
            ensure!(
                hanabi_protocol::is_player_count(participants.len()),
                "This command requires {MIN_PLAYERS} to {MAX_PLAYERS} participants"
            );
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
                message: json!(message),
            });
            self.persist(next).await?;
            let mut e = self.effects();
            self.add_chat(&mut e, &message);
            return self.publish(e).await;
        }
        if command == "tags" || command == "taglist" {
            let messages = if matches!(self.table.phase, Phase::Replay { .. }) {
                let id = self.table.game().expect("replay game").game_id;
                let tags = self
                    .store
                    .tags_for_game(id)
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
            ensure!(
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
                    message: json!(message),
                });
            }
            self.persist(next).await?;
            let mut e = self.effects();
            for message in messages {
                self.add_chat(&mut e, &message);
            }
            return self.publish(e).await;
        }
        if command == "suggest" {
            ensure!(args.len() == 1, "Expected /suggest [turn]");
            return self
                .suggest(session, i64::from(args[0].parse::<i32>()?))
                .await;
        }
        if ["split", "splitauto", "sa"].contains(&command.as_str()) {
            return self.split(session, &args, command != "split").await;
        }
        ensure!(
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
            bail!("This command requires a pregame table");
        };
        let mut boot = None;
        let notice;
        match command.as_str() {
            name if name == "s" || crate::lobby::start_player_count(name).is_some() => {
                let n = if let Some(arg) = args.first() {
                    arg.parse::<usize>()?
                } else {
                    crate::lobby::start_player_count(name).unwrap_or(players.len() + 1)
                };
                ensure!(
                    hanabi_protocol::is_player_count(n),
                    "Tables require {MIN_PLAYERS} to {MAX_PLAYERS} players"
                );
                *automatic_start = Some(n);
                *countdown = None;
                notice = format!("The game will start as soon as {n} players have joined.");
            }
            "si" | "startin" => {
                ensure!(args.len() == 1, "Expected /startin [minutes]");
                let minutes = parse_start_minutes(args[0]).context("Invalid countdown number")?;
                ensure!(
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
            "kick" => {
                ensure!(args.len() == 1, "Expected /kick [username]");
                let index = players
                    .iter()
                    .position(|p| {
                        crate::accounts::normalize_string(&p.name)
                            == crate::accounts::normalize_string(args[0])
                    })
                    .context("Player not found")?;
                ensure!(
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
            "impostor" => {
                ensure!(
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
            _ => bail!("Unknown table chat command: /{command}"),
        }
        let authored = authored_chat(self.table.id, &session.name, text);
        let notice = server_chat(self.table.id, &notice);
        next.chat.push(TableChat {
            id: None,
            user: session.user,
            message: json!(authored),
        });
        next.chat.push(TableChat {
            id: None,
            user: 0,
            message: json!(notice),
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
                        table_id: TableId(self.table.id),
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
