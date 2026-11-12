use super::request;
use super::table::wrong_phase;
use super::{
    HubCommand, Status, TableActor,
    chat::{private_server_chat, table_notice},
    pending::Completed,
    setup::next_requested_seed,
};
use crate::errors::CommandResult;
use crate::errors::OrReject;
use crate::{
    model::{ExtraOptions, IDLE_TIMEOUT_MS, PendingTag, Phase, Player, Tag, TagEdit, tag_too_long},
    transport::{Outgoing, Session, frame},
};
use anyhow::Context;
use chrono::Utc;
use hanabi_protocol::ClientMessage;
use hanabi_protocol::{HypotheticalEvent, MIN_PLAYERS, PregameStats, TableRef, UserId};
use hanabi_protocol::{MAX_TABLE_NAME_LENGTH, MAX_TAG_LENGTH};
use std::{
    collections::{BTreeMap, HashSet},
    sync::Arc,
};

/// Normalizes the text of a tag that a client sends, which may not be blank.
fn normalize_tag(raw: &str) -> CommandResult<String> {
    ensure_or_reject!(raw.len() <= MAX_TAG_LENGTH, "{}", tag_too_long());
    let tag = crate::accounts::normalize_string(
        raw.chars()
            .map(|c| if c.is_whitespace() { ' ' } else { c })
            .collect::<String>()
            .trim(),
    );
    ensure_or_reject!(!tag.is_empty(), "Tags cannot be blank.");
    Ok(tag)
}

/// Removes the moves of a hypothetical's last turn, the way clients go back. Morphs stay, since
/// clients keep them when going back.
pub(super) fn undo_hypothetical_turn(actions: &mut Vec<HypotheticalEvent>) {
    let is_turn = |action: &HypotheticalEvent| matches!(action, HypotheticalEvent::Turn { .. });
    let Some(last_turn) = actions.iter().rposition(is_turn) else {
        return;
    };
    let start = actions[..last_turn]
        .iter()
        .rposition(is_turn)
        .map_or(0, |i| i + 1);
    let mut index = 0;
    actions.retain(|action| {
        let keep = !(start..=last_turn).contains(&index)
            || matches!(
                action,
                HypotheticalEvent::Morph { .. } | HypotheticalEvent::Unmorph { .. }
            );
        index += 1;
        keep
    });
}

impl TableActor {
    /// Runs a command that only a replay accepts.
    pub(super) async fn replay_command(
        &mut self,
        session: Arc<Session>,
        message: ClientMessage,
    ) -> CommandResult<()> {
        match message {
            ClientMessage::ReplayAction(r) => self.replay_action(session, r).await,
            ClientMessage::TableSuggest(r) => self.suggest(session, r.turn).await,
            // A restart starts in `client`, through `start_restart`.
            ClientMessage::TableRestart(_) => {
                bail_internal!("A restart ran without its statistics")
            }
            ClientMessage::TableRestartDecline(r) => {
                self.decline_restart(session, r.declined).await
            }
            message @ (ClientMessage::TagAdd(_)
            | ClientMessage::TagRemove(_)
            | ClientMessage::TagRemoveAll(_)) => self.tag_message(session, message).await,
            message => Err(wrong_phase(&message)),
        }
    }
    /// Runs a tag command, which games in progress and replays accept.
    pub(super) async fn tag_message(
        &mut self,
        session: Arc<Session>,
        message: ClientMessage,
    ) -> CommandResult<()> {
        let edit = match message {
            ClientMessage::TagAdd(r) => TagEdit::Add(normalize_tag(&r.tag)?),
            ClientMessage::TagRemove(r) => TagEdit::Delete(normalize_tag(&r.tag)?),
            ClientMessage::TagRemoveAll(_) => TagEdit::DeleteAll,
            message => return Err(wrong_phase(&message)),
        };
        self.tag(session, edit).await
    }
    async fn tag(&mut self, session: Arc<Session>, edit: TagEdit) -> CommandResult<()> {
        ensure_or_reject!(self.attending(&session), "Not attending");
        let mut next = self.candidate();
        let replay = matches!(next.phase, Phase::Replay { .. });
        let s = next.game_mut().or_reject("No game")?;
        if replay {
            let game = s
                .game_id
                .or_reject("JSON replays do not have a database game to tag.")?;
            s.tags = crate::archive::tags(&self.store.primary, game)
                .await?
                .or_reject("That game no longer exists in the database.")?;
            ensure_or_reject!(
                self.attending(&session),
                "Tag author is no longer at this table."
            );
        }
        let exists =
            |tags: &[Tag], tag: &str| tags.iter().any(|t| t.user == session.user && t.tag == tag);
        match &edit {
            TagEdit::Add(tag) => {
                ensure_or_reject!(
                    !replay || !exists(&s.tags, tag),
                    "You have already tagged this game with \"{}\".",
                    crate::accounts::escape_html(tag)
                );
                if !replay {
                    s.tags.retain(|t| t.tag != *tag);
                }
                s.tags.push(Tag {
                    user: session.user,
                    tag: tag.clone(),
                });
            }
            TagEdit::Delete(tag) => {
                ensure_or_reject!(
                    exists(&s.tags, tag),
                    "The tag of \"{}\" does not exist on this game yet.",
                    crate::accounts::escape_html(tag)
                );
                s.tags
                    .retain(|t| t.tag != *tag || (replay && t.user != session.user));
            }
            TagEdit::DeleteAll => s.tags.retain(|t| t.user != session.user),
        }
        let name = crate::accounts::escape_html(&session.name);
        let text = match (&edit, replay) {
            (TagEdit::Add(tag), true) => format!(
                "{name} has added a game tag of \"{}\".",
                crate::accounts::escape_html(tag)
            ),
            (TagEdit::Delete(tag), true) => format!(
                "{name} has deleted a game tag of \"{}\".",
                crate::accounts::escape_html(tag)
            ),
            (TagEdit::DeleteAll, true) => {
                format!("{name} has deleted all their tags for this game.")
            }
            (TagEdit::Add(tag), false) => format!(
                "Successfully added a tag of \"{}\".",
                crate::accounts::escape_html(tag)
            ),
            (TagEdit::Delete(tag), false) => format!(
                "Successfully deleted the tag of \"{}\".",
                crate::accounts::escape_html(tag)
            ),
            (TagEdit::DeleteAll, false) => {
                "Successfully deleted all your tags for this game.".into()
            }
        };
        let edit = if replay {
            Some(PendingTag {
                game_id: s
                    .game_id
                    .or_reject("JSON replays cannot be tagged in the database")?,
                user_id: session.user,
                edit,
            })
        } else {
            None
        };
        // A replay posts the tag to its chat, so tagging is charged like a message. The tag is still
        // saved when its notice does not fit.
        let message = if replay {
            self.charge_chat(session.user)?;
            table_notice(&mut next, &text)
        } else {
            Some(private_server_chat(self.table.id, &session.name, &text))
        };
        self.persist_with(
            next,
            crate::store::Commit {
                tag: edit.as_ref(),
                ..crate::store::Commit::default()
            },
        )
        .await?;
        let mut e = self.effects();
        match message {
            Some(message) if replay => self.add_chat(&mut e, &message),
            Some(message) => e
                .messages
                .push((session, frame(hanabi_protocol::server::CHAT, message))),
            None => {}
        }
        self.publish(e).await
    }
    pub(super) async fn leader(
        &mut self,
        session: Arc<Session>,
        user: UserId,
    ) -> CommandResult<()> {
        ensure_or_reject!(self.attending(&session), "Not attending");
        let target = if matches!(self.table.phase, Phase::Replay { .. }) {
            self.audience()
                .find(|a| a.session.user == user)
                .map(|a| (a.session.user, a.session.name.clone()))
        } else {
            self.table
                .players()
                .iter()
                .find(|p| p.is(user))
                .and_then(|p| Some((p.id?, p.name.clone())))
        }
        .or_reject("That player is not at this table")?;
        ensure_or_reject!(
            target.0 != self.table.owner.user_id,
            "That player is already the leader"
        );
        ensure_or_reject!(
            !matches!(self.table.phase, Phase::Replay { .. }) || self.table.visible,
            "Solo replay cannot change leader"
        );
        let owner = hanabi_protocol::UserRef {
            user_id: target.0,
            username: target.1.as_str().into(),
        };
        let mut next = self.candidate();
        next.owner = owner.clone();
        if let Phase::Pregame { players, .. } = &mut next.phase {
            let seat = players
                .iter()
                .position(|player| player.is(target.0))
                .context("New leader is missing from pregame players")?;
            players.swap(0, seat);
        }
        if let Phase::Replay { replay, .. } = &mut next.phase {
            replay.leader = target.0;
        }
        let message = table_notice(
            &mut next,
            &format!(
                "{} has passed table ownership to: {}",
                crate::accounts::escape_html(&session.name),
                crate::accounts::escape_html(&target.1)
            ),
        );
        self.persist(next).await?;
        let mut e = self.effects();
        if let Some(message) = message {
            self.add_chat(&mut e, &message);
        }
        self.add_all(
            &mut e,
            hanabi_protocol::server::TABLE_OWNER,
            hanabi_protocol::TableOwner {
                table_id: self.table.id,
                owner,
            },
        );
        if matches!(self.table.phase, Phase::Pregame { .. }) {
            self.pregame_messages(&mut e);
        }
        self.publish(e).await
    }
    pub(super) async fn suggest(
        &self,
        session: Arc<Session>,
        segment: hanabi_protocol::Turn,
    ) -> CommandResult<()> {
        ensure_or_reject!(
            self.attending(&session) && self.table.visible,
            "Not a shared replay"
        );
        let leader = self
            .attendees
            .get(&self.table.owner.user_id)
            .filter(|a| a.session.active())
            .or_reject("Leader is not attending")?;
        let mut e = self.effects();
        e.messages.push((
            leader.session.clone(),
            frame(
                hanabi_protocol::server::TURN_SUGGESTION,
                hanabi_protocol::TurnSuggestion {
                    table_id: self.table.id,
                    username: session.name.clone().into(),
                    turn: segment,
                },
            ),
        ));
        self.publish(e).await
    }
    async fn replay_action(
        &mut self,
        session: Arc<Session>,
        r: hanabi_protocol::ReplayAction,
    ) -> CommandResult<()> {
        use hanabi_protocol::{HypotheticalControl as H, ReplayLeaderAction as R};

        ensure_or_reject!(
            self.attending(&session)
                && session.user == self.table.owner.user_id
                && self.table.visible,
            "You must lead this shared replay"
        );
        let mut next = self.candidate();
        let Phase::Replay {
            snapshot, replay, ..
        } = &mut next.phase
        else {
            bail_internal!("A replay command ran outside a replay");
        };
        // Arrows and sounds only reset the idle timer, so they skip the durable write.
        let checkpoint = !matches!(r.action, R::Arrow { .. } | R::Sound { .. });
        match &r.action {
            R::Turn { turn } => replay.segment = *turn,
            R::Arrow { .. } | R::Sound { .. } => {}
            R::Efficiency { modifier } => replay.efficiency_modifier = *modifier,
            R::Hypothetical { control } => match control {
                H::Start {} => {
                    ensure_or_reject!(!replay.hypothetical, "Already hypothetical");
                    replay.hypothetical = true;
                    replay.show_drawn_cards = false;
                }
                H::End {} => {
                    ensure_or_reject!(replay.hypothetical, "Not hypothetical");
                    replay.hypothetical = false;
                    replay.hypothetical_actions.clear();
                }
                H::Event { event } => {
                    ensure_or_reject!(
                        replay.hypothetical_actions.len() < crate::model::MAX_HYPOTHETICAL_ACTIONS
                            && crate::model::hypothetical_bytes(&replay.hypothetical_actions)?
                                + serde_json::to_string(event)?.len()
                                <= crate::model::MAX_HYPOTHETICAL_BYTES,
                        "Too many hypothetical actions"
                    );
                    replay.hypothetical_actions.push(event.clone());
                }
                H::Back {} => undo_hypothetical_turn(&mut replay.hypothetical_actions),
                H::ShowDrawnCards { show } => replay.show_drawn_cards = *show,
            },
        }
        let message = Outgoing::new(hanabi_protocol::server::REPLAY_ACTION, r);
        snapshot.idle_remaining = IDLE_TIMEOUT_MS;
        if checkpoint {
            self.persist(next).await?;
        } else {
            self.apply_without_checkpoint(next)?;
        }
        let mut e = self.effects();
        self.add_outgoing(&mut e, &message);
        self.publish(e).await
    }
    /// The players who play again if the leader in `session` restarts the shared replay, with the
    /// pregame hidden if `hide`.
    fn restart_players(&self, session: &Session, hide: bool) -> CommandResult<Vec<Player>> {
        let Phase::Replay { replay, .. } = &self.table.phase else {
            reject!("Only the shared replay leader can restart");
        };
        ensure_or_reject!(
            self.attending(session)
                && session.user == self.table.owner.user_id
                && self.table.visible,
            "Only the shared replay leader can restart"
        );
        self.seat(session)?;
        ensure_or_reject!(
            self.table.extra.replay.is_none(),
            "Cannot restart replayed games"
        );
        let players = self
            .table
            .players()
            .iter()
            .filter(|p| {
                // Restarting means the leader is playing again. A seat without a user cannot play.
                p.id.is_some_and(|id| {
                    (id == session.user || !replay.restart_declined.contains(&id))
                        && self.attendees.get(&id).is_some_and(|a| a.session.active())
                })
            })
            .cloned()
            .collect::<Vec<_>>();
        ensure_or_reject!(
            players.len() >= MIN_PLAYERS && (!hide || players.len() == self.table.players().len()),
            "Original players must attend to restart"
        );
        Ok(players)
    }
    /// Starts a restart of a shared replay. Saving the finished game's statistics and reading the
    /// players' statistics can take a while, so the table keeps answering other commands while
    /// they run; `finish_restart` does the rest. Returns `None` for a restart outside a replay,
    /// which `replay_command` refuses.
    pub(super) fn start_restart(
        &self,
        session: &Arc<Session>,
        hide: bool,
    ) -> Option<CommandResult<impl Future<Output = Completed> + Send + 'static>> {
        if !matches!(self.table.phase, Phase::Replay { .. }) {
            return None;
        }
        Some(self.prepare_restart(session, hide))
    }
    fn prepare_restart(
        &self,
        session: &Arc<Session>,
        hide: bool,
    ) -> CommandResult<impl Future<Output = Completed> + Send + 'static> {
        self.restart_players(session, hide)?;
        let snapshot = self.table.game().context("Missing completed game")?;
        // The replay may be visible before its background statistics finish.
        let finished = (snapshot.game_id.is_some() && !self.table.extra.no_write_to_database)
            .then(|| snapshot.clone());
        let variant = hanabi_engine::get_variant(&self.table.options.variant_name)?.id;
        let users = self.table.seated_users().collect::<Vec<_>>();
        let pool = self.store.primary.clone();
        let session = session.clone();
        Ok(async move {
            let stats = async {
                if let Some(finished) = finished {
                    crate::stats::refresh(&pool, &finished).await?;
                }
                crate::stats::pregame_stats_of(&pool, &users, variant).await
            }
            .await;
            Completed::Restart {
                session,
                hide,
                stats,
            }
        })
    }
    /// Finishes a restart once its statistics are saved and read. `stats` holds each original
    /// player's statistics on the variant.
    pub(super) async fn finish_restart(
        &mut self,
        session: Arc<Session>,
        hide: bool,
        stats: anyhow::Result<BTreeMap<UserId, PregameStats>>,
    ) -> CommandResult<()> {
        let mut stats = stats?;
        ensure_or_reject!(
            session.active(),
            "Session changed while refreshing restart statistics"
        );
        // The table kept running while the statistics were saved, so check the restart again.
        let mut players = self.restart_players(&session, hide)?;
        for player in &mut players {
            player.stats = stats
                .remove(&player.user()?)
                .unwrap_or_else(crate::stats::zero_stats);
        }
        let humans = players
            .iter()
            .filter(|p| !p.bot)
            .filter_map(|p| p.id)
            .collect::<Vec<_>>();
        // Players in a replay are not seated, so they could have joined another table meanwhile.
        // The reservation lasts until the table publishes its new players.
        let reservation = request(&self.hub, |reply| HubCommand::ReserveSeats {
            users: humans,
            from: self.table.id,
            reply,
        })
        .await??;
        let seated = players.iter().filter_map(|p| p.id).collect::<HashSet<_>>();
        let mut next = self.candidate();
        // The table keeps its ID and audience, but plays a new game, which its name counts.
        next.created = Utc::now();
        next.name = {
            let (base, count) =
                if let Some(m) = regex!(r"^(.*) \(#(\d+)\)$").captures(&self.table.name) {
                    (m[1].to_owned(), m[2].parse::<u64>()? + 1)
                } else {
                    (self.table.name.clone(), 2)
                };
            let suffix = format!(" (#{count})");
            format!(
                "{}{suffix}",
                crate::accounts::truncate_to_max_bytes(&base, MAX_TABLE_NAME_LENGTH - suffix.len())
            )
        };
        // A table that requested a seed moves on to the one after it.
        next.extra = ExtraOptions {
            set_seed_suffix: next_requested_seed(self.table.extra.set_seed_suffix.as_deref())?,
            ..ExtraOptions::default()
        };
        next.shadows.clear();
        next.phase = Phase::Pregame {
            players,
            kicked: vec![],
            runtime: crate::model::PregameRuntime::default(),
        };
        // Hiding the pregame starts the next game at once: every original player is here.
        if hide {
            next = self.started(next, &session).await?;
        }
        self.persist(next).await?;
        for a in self.attendees.values_mut() {
            a.spectator = !seated.contains(&a.session.user);
            a.shadow = None;
            a.loaded = false;
        }
        // Everyone leaves the replay first, then enters the next game or its pregame.
        let mut e = self.effects();
        let boot = frame(
            hanabi_protocol::server::TABLE_BOOTED,
            TableRef {
                table_id: self.table.id,
            },
        );
        for a in self.audience() {
            e.messages.push((a.session.clone(), boot.clone()));
        }
        if hide {
            self.start_messages(&mut e);
        } else {
            for a in self.audience() {
                e.statuses.push((
                    a.session.clone(),
                    if a.spectator {
                        Status::Spectating
                    } else {
                        Status::Pregame
                    },
                    Some(self.table.id),
                ));
            }
            self.pregame_messages(&mut e);
            let joined = frame(
                hanabi_protocol::server::TABLE_JOINED,
                TableRef {
                    table_id: self.table.id,
                },
            );
            let audience = self
                .audience()
                .map(|a| a.session.clone())
                .collect::<Vec<_>>();
            for session in audience {
                e.messages.push((session.clone(), joined.clone()));
                self.chat_history(&mut e, &session)?;
            }
        }
        self.spectator_messages(&mut e);
        self.publish(e).await?;
        drop(reservation);
        Ok(())
    }
    async fn decline_restart(
        &mut self,
        session: Arc<Session>,
        declined: bool,
    ) -> CommandResult<()> {
        ensure_or_reject!(
            self.attending(&session) && self.table.visible,
            "Not a shared replay"
        );
        self.seat(&session)?;
        let mut next = self.candidate();
        let Phase::Replay { replay, .. } = &mut next.phase else {
            bail_internal!("A replay command ran outside a replay");
        };
        if replay.restart_declined.contains(&session.user) == declined {
            return Ok(());
        }
        if declined {
            replay.restart_declined.push(session.user);
        } else {
            replay.restart_declined.retain(|&id| id != session.user);
        }
        self.persist(next).await?;
        let mut e = self.effects();
        self.add_all(
            &mut e,
            hanabi_protocol::server::RESTART_DECLINED,
            hanabi_protocol::RestartDeclined {
                table_id: self.table.id,
                restart_declined: self.restart_declined_names(),
            },
        );
        self.publish(e).await
    }
    /// The names of the players who will not play again if the leader restarts, in seat order.
    pub(super) fn restart_declined_names(&self) -> Vec<hanabi_protocol::Username> {
        let Phase::Replay { replay, .. } = &self.table.phase else {
            return vec![];
        };
        self.table
            .players()
            .iter()
            .filter(|p| p.id.is_some_and(|id| replay.restart_declined.contains(&id)))
            .map(|p| p.name.as_str().into())
            .collect()
    }
}
