use super::{Attendance, TableActor, chat::membership_notice, pregame::remove_pregame_players};
use crate::{
    model::{IDLE_TIMEOUT_MS, Phase},
    transport::{Session, frame},
};
use anyhow::{Context, Result};
use hanabi_protocol::{Status, TableId, TableRequest, TableStarted};
use std::{collections::HashSet, sync::Arc};

impl TableActor {
    /// Rejects a user who has blocked, or was blocked by, a player at this table or its owner.
    pub(super) fn ensure_not_blocked(&self, session: &Session, message: &str) -> Result<()> {
        let others = self
            .table
            .players()
            .iter()
            .map(|p| p.id)
            .chain([self.table.owner]);
        ensure_or_reject!(!session.blocks_any(others), "{message}");
        Ok(())
    }
    pub(super) async fn join(&mut self, session: Arc<Session>, password: String) -> Result<()> {
        let Phase::Pregame {
            players, kicked, ..
        } = &self.table.phase
        else {
            reject!("The table has started");
        };
        ensure_or_reject!(
            !kicked.contains(&session.user),
            "You were kicked from this table"
        );
        ensure_or_reject!(
            !players.iter().any(|p| p.id == session.user),
            "You have already joined this table."
        );
        let full = players.len() >= self.table.max_players;
        self.ensure_not_blocked(&session, "You cannot join this table.")?;
        if full {
            return self.join_full(&session).await;
        }
        if let Some(hash) = &self.table.password_hash {
            let hash = hash.clone();
            let valid = crate::accounts::verify_password(&session.ip, password, hash).await?;
            if !valid {
                eprintln!(
                    "Incorrect password for table {} by account {} from IP: {}",
                    self.table.id, session.user, session.ip
                );
                reject!("Incorrect table password");
            }
        }
        let variant = hanabi_engine::get_variant(&self.table.options.variant_name)?;
        let player = crate::stats::player(
            &self.store.primary,
            session.user,
            session.name.clone(),
            variant.id,
        )
        .await?;
        ensure_or_reject!(session.active(), "Session changed during join");
        let mut next = self.candidate();
        if let Phase::Pregame { players, .. } = &mut next.phase {
            players.push(player);
        }
        next.shadows.remove(&session.user);
        let message = membership_notice(
            &mut next,
            &format!(
                "{} joined the game.",
                crate::accounts::escape_html(&session.name)
            ),
        );
        self.persist(next).await?;
        self.initialize(session.clone(), vec![]).await?;
        let mut e = self.effects();
        if let Some(message) = message {
            for attendee in self.audience().filter(|a| a.session.user != session.user) {
                e.messages.push((
                    attendee.session.clone(),
                    frame(hanabi_protocol::server::CHAT, message.clone()),
                ));
            }
        }
        self.publish(e).await
    }
    /// Tells a full table, once per person, that someone else wants to play, so that the players
    /// can consider splitting into two tables.
    pub(super) async fn join_full(&mut self, session: &Arc<Session>) -> Result<()> {
        if self.table.password_hash.is_some() || !self.full_join_notices.insert(session.user) {
            reject!("This table is full.");
        }
        let mut next = self.candidate();
        let message = membership_notice(
            &mut next,
            &format!(
                "{} tried to join, but the table is full.",
                crate::accounts::escape_html(&session.name)
            ),
        );
        self.persist(next).await?;
        let mut e = self.effects();
        if let Some(message) = message {
            for attendee in self.audience() {
                e.messages.push((
                    attendee.session.clone(),
                    frame(hanabi_protocol::server::CHAT, message.clone()),
                ));
            }
        }
        self.publish(e).await?;
        reject!("This table is full. The players were told that you want to join.");
    }
    pub(super) async fn reattend(
        &mut self,
        session: Arc<Session>,
        spectating: bool,
        requested_shadow: Option<i64>,
    ) -> Result<()> {
        let replay = matches!(self.table.phase, Phase::Replay { .. });
        let seat = self
            .table
            .players()
            .iter()
            .position(|p| p.id == session.user);
        ensure_or_reject!(
            spectating || seat.is_some() || replay,
            "You are not a player"
        );
        ensure_or_reject!(
            !spectating || seat.is_none() || replay,
            "Players cannot spectate their own ongoing game"
        );
        if seat.is_none() {
            self.ensure_not_blocked(
                &session,
                if replay {
                    "You cannot join this replay."
                } else {
                    "You cannot spectate this table."
                },
            )?;
        }
        let shadow = if spectating {
            requested_shadow
                .and_then(|v| usize::try_from(v).ok())
                .filter(|v| *v < self.table.players().len())
        } else if replay {
            self.table
                .shadows
                .get(&session.user)
                .copied()
                .flatten()
                .and_then(|v| usize::try_from(v).ok())
        } else {
            None
        };
        let pregame = matches!(self.table.phase, Phase::Pregame { .. });
        let mut next = self.candidate();
        next.shadows
            .insert(session.user, shadow.map(hanabi_engine::int));
        if replay {
            next.game_mut().context("Missing replay")?.idle_remaining = IDLE_TIMEOUT_MS;
        }
        let notice = if pregame && spectating && !self.spectating(session.user) {
            membership_notice(
                &mut next,
                &format!(
                    "{} joined the game (as a spectator).",
                    crate::accounts::escape_html(&session.name)
                ),
            )
        } else {
            None
        };
        self.persist(next).await?;
        if pregame && !spectating && session.active() {
            self.pregame_absent_until.remove(&session.user);
        }
        self.attendees.insert(
            session.user,
            Attendance {
                session: session.clone(),
                loaded: false,
                spectator: spectating || replay,
                shadow,
                typing_until: None,
            },
        );
        self.replay_absent_until = None;
        let mut e = self.effects();
        if let Some(notice) = notice {
            for attendee in self.audience().filter(|a| a.session.user != session.user) {
                e.messages.push((
                    attendee.session.clone(),
                    frame(hanabi_protocol::server::CHAT, notice.clone()),
                ));
            }
        }
        e.statuses.push((
            session.clone(),
            if replay {
                if self.table.visible {
                    Status::SharedReplay
                } else {
                    Status::Replay
                }
            } else if spectating {
                Status::Spectating
            } else if pregame {
                Status::PreGame
            } else {
                Status::Playing
            },
            Some(self.table.id),
        ));
        if pregame {
            self.pregame_messages(&mut e);
            e.messages.push((
                session.clone(),
                frame(
                    hanabi_protocol::server::JOINED,
                    TableRequest {
                        table_id: TableId(self.table.id),
                    },
                ),
            ));
            self.chat_history(&mut e, &session)?;
        } else {
            e.messages.push((
                session,
                frame(
                    hanabi_protocol::server::TABLE_START,
                    TableStarted {
                        table_id: TableId(self.table.id),
                        replay,
                    },
                ),
            ));
        }
        self.spectator_messages(&mut e);
        self.publish(e).await
    }
    pub(super) async fn leave(&mut self, session: Arc<Session>, remove: bool) -> Result<()> {
        // Players can leave a pregame that they returned to the lobby from, such as to join another.
        let attending = self.attending(&session);
        ensure_or_reject!(
            attending
                || (remove
                    && matches!(self.table.phase, Phase::Pregame { .. })
                    && self.table.players().iter().any(|p| p.id == session.user)),
            "You are not attending this table"
        );
        let mut next = self.candidate();
        let mut notices = vec![];
        next.shadows.remove(&session.user);
        if matches!(next.phase, Phase::Pregame { .. }) {
            if self.spectating(session.user) {
                notices.extend(membership_notice(
                    &mut next,
                    &format!(
                        "{} left the game (as a spectator).",
                        crate::accounts::escape_html(&session.name)
                    ),
                ));
            } else if remove {
                notices = remove_pregame_players(&mut next, &HashSet::from([session.user]));
                if next.players().is_empty() {
                    return self.retire().await;
                }
            }
        }
        if matches!(next.phase, Phase::Replay { .. })
            && next.owner == session.user
            && let Some(a) = self.audience().find(|a| a.session.user != session.user)
        {
            next.owner = a.session.user;
            if let Phase::Replay { replay, .. } = &mut next.phase {
                replay.leader = next.owner;
            }
        }
        self.persist(next).await?;
        let mut e = if attending {
            self.attendees.remove(&session.user);
            let mut e = self.effects();
            e.statuses.push((session.clone(), Status::Lobby, None));
            e.messages.push((
                session,
                frame(
                    hanabi_protocol::server::LEFT,
                    TableRequest {
                        table_id: TableId(self.table.id),
                    },
                ),
            ));
            e
        } else {
            self.effects()
        };
        if matches!(self.table.phase, Phase::Pregame { .. }) {
            self.pregame_messages(&mut e);
        }
        for message in notices {
            self.add_chat(&mut e, &message);
        }
        self.spectator_messages(&mut e);
        self.publish(e).await?;
        if matches!(self.table.phase, Phase::Replay { .. }) && self.attendees.is_empty() {
            self.retire().await?;
        }
        Ok(())
    }
}
