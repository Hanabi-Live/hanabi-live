use super::table::wrong_phase;
use super::{TableActor, chat::server_chat, setup::next_requested_seed};
use crate::errors::OrReject;
use crate::{
    model::{
        ExtraOptions, IDLE_TIMEOUT_MS, MAX_TABLE_NAME_LENGTH, MAX_TAG_LENGTH, PendingTag, Phase,
        TableChat, Tag, TagOperation, tag_too_long,
    },
    transport::{Outgoing, Session, frame},
};
use anyhow::{Context, Result};
use chrono::Utc;
use hanabi_protocol::ClientMessage;
use hanabi_protocol::{HypotheticalAction, MIN_PLAYERS, TableId, TableRequest};
use std::sync::Arc;

/// Removes the moves of a hypothetical's last turn, the way clients go back. Morphs stay, since
/// clients keep them when going back.
pub(super) fn undo_hypothetical_turn(actions: &mut Vec<HypotheticalAction>) {
    let is_turn = |action: &HypotheticalAction| matches!(action, HypotheticalAction::Turn { .. });
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
                HypotheticalAction::Morph { .. } | HypotheticalAction::Unmorph { .. }
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
    ) -> Result<()> {
        match message {
            ClientMessage::ReplayAction(r) => self.replay_action(session, r).await,
            ClientMessage::TableSuggest(r) => self.suggest(session, r.segment).await,
            ClientMessage::TableRestart(r) => self.restart(session, r.hide_pregame).await,
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
    ) -> Result<()> {
        match message {
            ClientMessage::Tag(r) => self.tag(session, &r.msg, &r.room, TagOperation::Tag).await,
            ClientMessage::TagDelete(r) => {
                self.tag(session, &r.msg, &r.room, TagOperation::TagDelete)
                    .await
            }
            ClientMessage::TagsDeleteAll(r) => {
                self.tag(session, "", &r.room, TagOperation::TagsDeleteAll)
                    .await
            }
            message => Err(wrong_phase(&message)),
        }
    }
    async fn tag(
        &mut self,
        session: Arc<Session>,
        raw: &str,
        room: &str,
        operation: TagOperation,
    ) -> Result<()> {
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
            ensure_or_reject!(
                s.game_id > 0,
                "JSON replays do not have a database game to tag."
            );
            s.tags = self
                .store
                .tags_for_game(s.game_id)
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
            ensure_or_reject!(
                s.game_id > 0,
                "JSON replays cannot be tagged in the database"
            );
            Some(PendingTag {
                game_id: s.game_id,
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
        let mut message = server_chat(self.table.id, &text);
        if replay {
            next.chat.push(TableChat {
                id: None,
                user: 0,
                message: message.clone(),
            });
        } else {
            message.room = Some(room.to_owned());
            message.recipient = Some(session.name.clone());
        }
        self.persist_with(
            next,
            crate::store::Commit {
                tag: edit.as_ref(),
                ..crate::store::Commit::default()
            },
        )
        .await?;
        let mut e = self.effects();
        if replay {
            self.add_chat(&mut e, &message);
        } else {
            e.messages
                .push((session, frame(hanabi_protocol::server::CHAT, message)));
        }
        self.publish(e).await
    }
    pub(super) async fn leader(&mut self, session: Arc<Session>, name: &str) -> Result<()> {
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
        let message = server_chat(
            self.table.id,
            &format!(
                "{} has passed table ownership to: {}",
                crate::accounts::escape_html(&session.name),
                crate::accounts::escape_html(&target.1)
            ),
        );
        next.chat.push(TableChat {
            id: None,
            user: 0,
            message: message.clone(),
        });
        self.persist(next).await?;
        let mut e = self.effects();
        self.add_chat(&mut e, &message);
        self.add_all(
            &mut e,
            hanabi_protocol::server::REPLAY_LEADER,
            hanabi_protocol::ReplayLeader {
                table_id: TableId(self.table.id),
                name: target.1.clone(),
            },
        );
        if matches!(self.table.phase, Phase::Pregame { .. }) {
            self.pregame_messages(&mut e);
        }
        self.publish(e).await
    }
    pub(super) async fn suggest(&self, session: Arc<Session>, segment: i64) -> Result<()> {
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
                    table_id: TableId(self.table.id),
                    user_name: session.name.clone(),
                    segment,
                },
            ),
        ));
        self.publish(e).await
    }
    async fn replay_action(
        &mut self,
        session: Arc<Session>,
        r: hanabi_protocol::ReplayActionRequest,
    ) -> Result<()> {
        use hanabi_protocol::ReplayActionRequest as R;

        ensure_or_reject!(
            self.attending(&session) && session.user == self.table.owner && self.table.visible,
            "You must lead this shared replay"
        );
        let mut next = self.candidate();
        let Phase::Replay { snapshot, replay } = &mut next.phase else {
            unreachable!("replay commands run in replays");
        };
        // Arrows and sounds only reset the idle timer, so they skip the durable write.
        let checkpoint = !matches!(r, R::Arrow { .. } | R::Sound { .. });
        let message = match r {
            R::Segment { segment, .. } => {
                replay.segment = segment;
                Outgoing::new(
                    hanabi_protocol::server::REPLAY_SEGMENT,
                    hanabi_protocol::ReplaySegment {
                        table_id: TableId(self.table.id),
                        segment: i64::from(segment),
                    },
                )
            }
            R::Arrow { order, .. } => Outgoing::new(
                hanabi_protocol::server::REPLAY_INDICATOR,
                hanabi_protocol::ReplayIndicator {
                    table_id: TableId(self.table.id),
                    order,
                },
            ),
            R::Sound { sound, .. } => Outgoing::new(
                hanabi_protocol::server::REPLAY_SOUND,
                hanabi_protocol::ReplaySound {
                    table_id: TableId(self.table.id),
                    sound,
                },
            ),
            R::HypoStart { .. } => {
                ensure_or_reject!(!replay.hypothetical, "Already hypothetical");
                replay.hypothetical = true;
                replay.show_drawn_cards = false;
                Outgoing::new(
                    hanabi_protocol::server::HYPO_START,
                    TableRequest {
                        table_id: TableId(self.table.id),
                    },
                )
            }
            R::HypoEnd { .. } => {
                ensure_or_reject!(replay.hypothetical, "Not hypothetical");
                replay.hypothetical = false;
                replay.hypothetical_actions.clear();
                Outgoing::new(
                    hanabi_protocol::server::HYPO_END,
                    TableRequest {
                        table_id: TableId(self.table.id),
                    },
                )
            }
            R::HypoAction { action, .. } => {
                ensure_or_reject!(
                    replay.hypothetical_actions.len() < crate::model::MAX_HYPOTHETICAL_ACTIONS
                        && crate::model::hypothetical_bytes(&replay.hypothetical_actions)?
                            + serde_json::to_string(&action)?.len()
                            <= crate::model::MAX_HYPOTHETICAL_BYTES,
                    "Too many hypothetical actions"
                );
                replay.hypothetical_actions.push(action.clone());
                Outgoing::new(hanabi_protocol::server::HYPO_ACTION, action)
            }
            R::HypoBack { .. } => {
                undo_hypothetical_turn(&mut replay.hypothetical_actions);
                Outgoing::new(
                    hanabi_protocol::server::HYPO_BACK,
                    TableRequest {
                        table_id: TableId(self.table.id),
                    },
                )
            }
            R::HypoToggleRevealed { .. } => {
                replay.show_drawn_cards = !replay.show_drawn_cards;
                Outgoing::new(
                    hanabi_protocol::server::HYPO_SHOW_DRAWN_CARDS,
                    hanabi_protocol::HypoShowDrawnCards {
                        table_id: TableId(self.table.id),
                        show_drawn_cards: replay.show_drawn_cards,
                    },
                )
            }
            R::EfficiencyMod { r#mod, .. } => {
                replay.efficiency_modifier = r#mod;
                Outgoing::new(
                    hanabi_protocol::server::REPLAY_EFFICIENCY_MOD,
                    hanabi_protocol::ReplayEfficiencyMod {
                        table_id: TableId(self.table.id),
                        r#mod: replay.efficiency_modifier,
                    },
                )
            }
        };
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
    async fn restart(&mut self, session: Arc<Session>, hide: bool) -> Result<()> {
        ensure_or_reject!(
            self.attending(&session) && session.user == self.table.owner && self.table.visible,
            "Only the shared replay leader can restart"
        );
        self.seat(&session)?;
        ensure_or_reject!(
            !self.table.extra.set_replay,
            "Cannot restart replayed games"
        );
        let declined = match &self.table.phase {
            Phase::Replay { replay, .. } => replay.restart_declined.as_slice(),
            _ => &[],
        };
        let mut players = self
            .table
            .players()
            .iter()
            .filter(|p| {
                // Restarting means the leader is playing again.
                (p.id == session.user || !declined.contains(&p.id))
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
        let snapshot = self.table.game().context("Missing completed game")?;
        if snapshot.game_id > 0 && !self.table.extra.no_write_to_database {
            // The replay may be visible before its background statistics finish.
            self.store.refresh(snapshot).await?;
        }
        let variant = hanabi_engine::get_variant(&self.table.options.variant_name)?;
        for player in &mut players {
            player.stats = self
                .store
                .player_for_variant(player.id, player.name.clone(), variant.id)
                .await?
                .stats;
        }
        ensure_or_reject!(
            session.active(),
            "Session changed while refreshing restart statistics"
        );
        let allocation = self.allocation().await?;
        let mut destination = self.table.clone();
        destination.id = allocation.id;
        destination.created = Utc::now();
        destination.name = {
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
        destination.extra = ExtraOptions {
            set_seed_suffix: next_requested_seed(&self.table.extra.set_seed_suffix)?,
            ..ExtraOptions::default()
        };
        destination.shadows.clear();
        destination.phase = Phase::Pregame {
            automatic_start: hide.then_some(players.len()),
            players,
            countdown: None,
            kicked: vec![],
        };
        let moving = self
            .audience()
            .map(|a| {
                let spectator = destination.players().iter().all(|p| p.id != a.session.user);
                (a.session.clone(), spectator, None)
            })
            .collect();
        self.transfer(self.candidate(), destination, allocation, moving, true)
            .await
    }
    async fn decline_restart(&mut self, session: Arc<Session>, declined: bool) -> Result<()> {
        ensure_or_reject!(
            self.attending(&session) && self.table.visible,
            "Not a shared replay"
        );
        self.seat(&session)?;
        let mut next = self.candidate();
        let Phase::Replay { replay, .. } = &mut next.phase else {
            unreachable!("replay commands run in replays");
        };
        if replay.restart_declined.contains(&session.user) == declined {
            return Ok(());
        }
        if declined {
            replay.restart_declined.push(session.user);
        } else {
            replay.restart_declined.retain(|&id| id != session.user);
        }
        let name = crate::accounts::escape_html(&session.name);
        let message = server_chat(
            self.table.id,
            &if declined {
                format!("{name} is not ready to play again.")
            } else {
                format!("{name} is ready to play again.")
            },
        );
        next.chat.push(TableChat {
            id: None,
            user: 0,
            message: message.clone(),
        });
        self.persist(next).await?;
        let mut e = self.effects();
        self.add_chat(&mut e, &message);
        self.add_all(
            &mut e,
            hanabi_protocol::server::RESTART_DECLINED,
            hanabi_protocol::RestartDeclined {
                table_id: TableId(self.table.id),
                names: self.restart_declined_names(),
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
