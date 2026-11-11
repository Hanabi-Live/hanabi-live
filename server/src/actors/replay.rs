use super::request;
use super::table::wrong_phase;
use super::{
    HubCommand, TableActor,
    chat::{server_chat, table_notice},
    pending::Completed,
    setup::next_requested_seed,
};
use crate::errors::CommandResult;
use crate::errors::OrReject;
use crate::{
    model::{
        ExtraOptions, IDLE_TIMEOUT_MS, MAX_TABLE_NAME_LENGTH, MAX_TAG_LENGTH, PendingTag, Phase,
        Player, Tag, TagOperation, tag_too_long,
    },
    transport::{Outgoing, Session, frame},
};
use anyhow::Context;
use chrono::Utc;
use hanabi_protocol::ClientMessage;
use hanabi_protocol::{HypotheticalEvent, MIN_PLAYERS, PregameStats, Status, TableRef, UserId};
use std::{
    collections::{BTreeMap, HashSet},
    sync::Arc,
};

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
            ClientMessage::TableSuggest(r) => self.suggest(session, r.segment).await,
            // A restart starts in `client`, through `start_restart`.
            ClientMessage::TableRestart(_) => {
                bail_internal!("A restart ran without its statistics")
            }
            ClientMessage::TableRestartDecline(r) => {
                self.decline_restart(session, r.declined).await
            }
            message @ (ClientMessage::Tag(_)
            | ClientMessage::TagDelete(_)
            | ClientMessage::TagsDeleteAll(_)) => self.tag_message(session, message).await,
            message => Err(wrong_phase(&message)),
        }
    }
    /// Runs a tag command, which games in progress and replays accept.
    pub(super) async fn tag_message(
        &mut self,
        session: Arc<Session>,
        message: ClientMessage,
    ) -> CommandResult<()> {
        match message {
            ClientMessage::Tag(r) => self.tag(session, &r.tag, TagOperation::Tag).await,
            ClientMessage::TagDelete(r) => self.tag(session, &r.tag, TagOperation::TagDelete).await,
            ClientMessage::TagsDeleteAll(_) => {
                self.tag(session, "", TagOperation::TagsDeleteAll).await
            }
            message => Err(wrong_phase(&message)),
        }
    }
    async fn tag(
        &mut self,
        session: Arc<Session>,
        raw: &str,
        operation: TagOperation,
    ) -> CommandResult<()> {
        ensure_or_reject!(self.attending(&session), "Not attending");
        ensure_or_reject!(raw.len() <= MAX_TAG_LENGTH, "{}", tag_too_long());
        let tag = crate::accounts::normalize_string(
            raw.chars()
                .map(|c| if c.is_whitespace() { ' ' } else { c })
                .collect::<String>()
                .trim(),
        );
        ensure_or_reject!(
            operation == TagOperation::TagsDeleteAll || !tag.is_empty(),
            "Tags cannot be blank."
        );
        let mut next = self.candidate();
        let replay = matches!(next.phase, Phase::Replay { .. });
        let s = next.game_mut().or_reject("No game")?;
        let escaped = crate::accounts::escape_html(&tag);
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
        let exists = s
            .tags
            .iter()
            .any(|t| t.user == session.user && t.tag == tag);
        if operation == TagOperation::Tag {
            ensure_or_reject!(
                !replay || !exists,
                "You have already tagged this game with \"{escaped}\"."
            );
            if !replay {
                s.tags.retain(|t| t.tag != tag);
            }
            s.tags.push(Tag {
                user: session.user,
                tag: tag.clone(),
            });
        } else {
            ensure_or_reject!(
                operation == TagOperation::TagsDeleteAll || exists,
                "The tag of \"{escaped}\" does not exist on this game yet."
            );
            s.tags.retain(|t| {
                if operation == TagOperation::TagsDeleteAll {
                    t.user != session.user
                } else if replay {
                    t.user != session.user || t.tag != tag
                } else {
                    t.tag != tag
                }
            });
        }
        let edit = if replay {
            Some(PendingTag {
                game_id: s
                    .game_id
                    .or_reject("JSON replays cannot be tagged in the database")?,
                user_id: session.user,
                operation,
                tag: tag.clone(),
            })
        } else {
            None
        };
        let verb = if operation == TagOperation::Tag {
            "added"
        } else {
            "deleted"
        };
        let text = if replay {
            if operation == TagOperation::TagsDeleteAll {
                format!(
                    "{} has deleted all their tags for this game.",
                    crate::accounts::escape_html(&session.name)
                )
            } else {
                format!(
                    "{} has {verb} a game tag of \"{escaped}\".",
                    crate::accounts::escape_html(&session.name)
                )
            }
        } else if operation == TagOperation::TagsDeleteAll {
            "Successfully deleted all your tags for this game.".into()
        } else {
            format!(
                "Successfully {verb} {} tag of \"{escaped}\".",
                if operation == TagOperation::Tag {
                    "a"
                } else {
                    "the"
                }
            )
        };
        // A replay posts the tag to its chat, so tagging is charged like a message. The tag is still
        // saved when its notice does not fit.
        let message = if replay {
            self.charge_chat(session.user)?;
            table_notice(&mut next, &text)
        } else {
            let mut message = server_chat(self.table.id, &text);
            message.recipient = Some(session.name.clone());
            Some(message)
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
    pub(super) async fn leader(&mut self, session: Arc<Session>, name: &str) -> CommandResult<()> {
        ensure_or_reject!(self.attending(&session), "Not attending");
        let target = if matches!(self.table.phase, Phase::Replay { .. }) {
            self.audience()
                .find(|a| {
                    crate::accounts::normalize_string(&a.session.name)
                        == crate::accounts::normalize_string(name)
                })
                .map(|a| (a.session.user, a.session.name.clone()))
        } else {
            self.table
                .players()
                .iter()
                .find(|p| {
                    crate::accounts::normalize_string(&p.name)
                        == crate::accounts::normalize_string(name)
                })
                .map(|p| (p.id, p.name.clone()))
        }
        .or_reject("That player is not at this table")?;
        ensure_or_reject!(
            target.0 != self.table.owner,
            "That player is already the leader"
        );
        ensure_or_reject!(
            !matches!(self.table.phase, Phase::Replay { .. }) || self.table.visible,
            "Solo replay cannot change leader"
        );
        let mut next = self.candidate();
        next.owner = target.0;
        if let Phase::Pregame { players, .. } = &mut next.phase {
            let seat = players
                .iter()
                .position(|player| player.id == target.0)
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
            hanabi_protocol::server::REPLAY_LEADER,
            hanabi_protocol::ReplayLeader {
                table_id: self.table.id,
                username: target.1.clone(),
            },
        );
        if matches!(self.table.phase, Phase::Pregame { .. }) {
            self.pregame_messages(&mut e);
        }
        self.publish(e).await
    }
    pub(super) async fn suggest(&self, session: Arc<Session>, segment: i32) -> CommandResult<()> {
        ensure_or_reject!(
            self.attending(&session) && self.table.visible,
            "Not a shared replay"
        );
        let leader = self
            .attendees
            .get(&self.table.owner)
            .filter(|a| a.session.active())
            .or_reject("Leader is not attending")?;
        let mut e = self.effects();
        e.messages.push((
            leader.session.clone(),
            frame(
                hanabi_protocol::server::SUGGESTION,
                hanabi_protocol::Suggestion {
                    table_id: self.table.id,
                    username: session.name.clone(),
                    segment,
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
        use hanabi_protocol::ReplayLeaderAction as R;

        ensure_or_reject!(
            self.attending(&session) && session.user == self.table.owner && self.table.visible,
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
            R::Segment { segment } => replay.segment = *segment,
            R::Arrow { .. } | R::Sound { .. } => {}
            R::HypoStart {} => {
                ensure_or_reject!(!replay.hypothetical, "Already hypothetical");
                replay.hypothetical = true;
                replay.show_drawn_cards = false;
            }
            R::HypoEnd {} => {
                ensure_or_reject!(replay.hypothetical, "Not hypothetical");
                replay.hypothetical = false;
                replay.hypothetical_actions.clear();
            }
            R::HypoAction { action } => {
                ensure_or_reject!(
                    replay.hypothetical_actions.len() < crate::model::MAX_HYPOTHETICAL_ACTIONS
                        && crate::model::hypothetical_bytes(&replay.hypothetical_actions)?
                            + serde_json::to_string(action)?.len()
                            <= crate::model::MAX_HYPOTHETICAL_BYTES,
                    "Too many hypothetical actions"
                );
                replay.hypothetical_actions.push(action.clone());
            }
            R::HypoBack {} => undo_hypothetical_turn(&mut replay.hypothetical_actions),
            R::HypoShowDrawnCards { show_drawn_cards } => {
                replay.show_drawn_cards = *show_drawn_cards;
            }
            R::EfficiencyModifier {
                efficiency_modifier,
            } => replay.efficiency_modifier = *efficiency_modifier,
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
            self.attending(session) && session.user == self.table.owner && self.table.visible,
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
                // Restarting means the leader is playing again.
                (p.id == session.user || !replay.restart_declined.contains(&p.id))
                    && self
                        .attendees
                        .get(&p.id)
                        .is_some_and(|a| a.session.active())
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
        let users = self
            .table
            .players()
            .iter()
            .map(|p| p.id)
            .collect::<Vec<_>>();
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
                .remove(&player.id)
                .unwrap_or_else(crate::stats::zero_stats);
        }
        let humans = players
            .iter()
            .filter(|p| !p.bot)
            .map(|p| p.id)
            .collect::<Vec<_>>();
        // Players in a replay are not seated, so they could have joined another table meanwhile.
        // The reservation lasts until the table publishes its new players.
        let reservation = request(&self.hub, |reply| HubCommand::ReserveSeats {
            users: humans,
            from: self.table.id,
            reply,
        })
        .await??;
        let seated = players.iter().map(|p| p.id).collect::<HashSet<_>>();
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
            hanabi_protocol::server::BOOT,
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
                hanabi_protocol::server::JOINED,
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
                usernames: self.restart_declined_names(),
            },
        );
        self.publish(e).await
    }
    /// The names of the players who will not play again if the leader restarts, in seat order.
    pub(super) fn restart_declined_names(&self) -> Vec<String> {
        let Phase::Replay { replay, .. } = &self.table.phase else {
            return vec![];
        };
        self.table
            .players()
            .iter()
            .filter(|p| replay.restart_declined.contains(&p.id))
            .map(|p| p.name.clone())
            .collect()
    }
}
