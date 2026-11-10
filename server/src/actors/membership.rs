use super::{
    Attendance, Blocks, TableActor, chat::table_notice, pending::Completed,
    pregame::remove_pregame_players,
};
use crate::errors::CommandResult;
use crate::{
    model::{IDLE_TIMEOUT_MS, Phase, Seat},
    transport::{Session, frame},
};
use anyhow::Context;
use chrono::Utc;
use hanabi_protocol::UserId;
use hanabi_protocol::{
    LobbySound, SoundLobby, Status, TableJoinRequest, TableRequest, TableStarted,
};
use std::{
    collections::{BTreeSet, HashSet},
    sync::Arc,
    time::{Duration, Instant},
};

/// After a player joins a table, further joins within this time do not play the join sound again.
const JOIN_SOUND_INTERVAL: Duration = Duration::from_secs(15);

impl TableActor {
    /// Rejects a user who has blocked, or was blocked by, a player at this table or its owner.
    fn ensure_not_blocked(&self, blocks: &BTreeSet<UserId>, message: &str) -> CommandResult<()> {
        ensure_or_reject!(
            !self
                .table
                .players()
                .iter()
                .map(|p| p.id)
                .chain([self.table.owner])
                .any(|user| blocks.contains(&user)),
            "{message}"
        );
        Ok(())
    }
    /// Checks that a user may join this table, apart from its password. Returns whether the table
    /// is full.
    fn join_allowed(&self, session: &Session, blocks: &BTreeSet<UserId>) -> CommandResult<bool> {
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
        self.ensure_not_blocked(blocks, "You cannot join this table.")?;
        Ok(players.len() >= self.table.max_players)
    }
    /// Starts the password check of a join to a table with a password, which can take seconds
    /// while other password checks run. Returns `None` for a join that needs no check, or that
    /// fails without one; `join` then answers it.
    pub(super) fn start_password_check(
        &self,
        session: &Arc<Session>,
        blocks: &Blocks,
        request: &TableJoinRequest,
    ) -> Option<impl Future<Output = Completed> + Send + 'static> {
        let hash = self.table.password_hash.clone()?;
        if !matches!(self.join_allowed(session, blocks), Ok(false)) {
            return None;
        }
        let (session, blocks, password) =
            (session.clone(), blocks.clone(), request.password.clone());
        Some(async move {
            let valid = crate::accounts::verify_password(&session.ip, password, hash.clone()).await;
            Completed::Password {
                session,
                blocks,
                hash,
                valid,
            }
        })
    }
    /// Finishes a join whose password check has finished.
    pub(super) async fn finish_password_check(
        &mut self,
        session: Arc<Session>,
        blocks: &BTreeSet<UserId>,
        hash: String,
        valid: anyhow::Result<bool>,
    ) -> CommandResult<()> {
        if !valid? {
            tracing::warn!(
                "Incorrect password for table {} by account {} from IP: {}",
                self.table.id,
                session.user,
                session.ip
            );
            reject!("Incorrect table password");
        }
        ensure_or_reject!(session.active(), "Session changed during join");
        self.join(session, blocks, Some(&hash)).await
    }
    /// Adds a user to the pregame. A table with a password needs `checked_hash`: the password hash
    /// that the user's password matched.
    pub(super) async fn join(
        &mut self,
        session: Arc<Session>,
        blocks: &BTreeSet<UserId>,
        checked_hash: Option<&str>,
    ) -> CommandResult<()> {
        if self.join_allowed(&session, blocks)? {
            return self.join_full(&session).await;
        }
        if let Some(hash) = &self.table.password_hash {
            ensure_or_reject!(checked_hash.is_some(), "Incorrect table password");
            ensure_or_reject!(
                checked_hash == Some(hash.as_str()),
                "The table password changed. Please try again."
            );
        }
        let variant = hanabi_engine::get_variant(&self.table.options.variant_name)?;
        let player =
            crate::stats::player(&self.store.primary, &session.identity, variant.id).await?;
        ensure_or_reject!(session.active(), "Session changed during join");
        let mut next = self.candidate();
        if let Phase::Pregame { players, .. } = &mut next.phase {
            players.push(player);
        }
        next.shadows.remove(&session.user);
        let message = table_notice(
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
        let since_last_join = match self
            .last_join()
            .and_then(|last| last.replace(Instant::now()))
        {
            Some(last) => last.elapsed(),
            // The owner joined when the table was created.
            None => (Utc::now() - self.table.created)
                .to_std()
                .unwrap_or_default(),
        };
        if since_last_join > JOIN_SOUND_INTERVAL {
            let players: HashSet<UserId> = self.table.players().iter().map(|p| p.id).collect();
            let sound = frame(
                hanabi_protocol::server::SOUND_LOBBY,
                SoundLobby {
                    file: LobbySound::SomeoneJoined,
                },
            );
            for attendee in self
                .audience()
                .filter(|a| a.session.user != session.user && players.contains(&a.session.user))
            {
                e.messages.push((attendee.session.clone(), sound.clone()));
            }
        }
        self.publish(e).await
    }
    /// Tells a full table, once per person, that someone else wants to play, so that the players
    /// can consider splitting into two tables.
    pub(super) async fn join_full(&mut self, session: &Arc<Session>) -> CommandResult<()> {
        if self.table.password_hash.is_some()
            || !self
                .full_join_notices()
                .is_some_and(|notices| notices.insert(session.user))
        {
            reject!("This table is full.");
        }
        let mut next = self.candidate();
        let message = table_notice(
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
        blocks: &BTreeSet<UserId>,
        spectating: bool,
        requested_shadow: Option<Seat>,
    ) -> CommandResult<()> {
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
                blocks,
                if replay {
                    "You cannot join this replay."
                } else {
                    "You cannot spectate this table."
                },
            )?;
        }
        let shadow = if spectating {
            requested_shadow.filter(|seat| seat.index() < self.table.players().len())
        } else if replay {
            self.table.shadows.get(&session.user).copied().flatten()
        } else {
            None
        };
        let pregame = matches!(self.table.phase, Phase::Pregame { .. });
        let mut next = self.candidate();
        next.shadows.insert(session.user, shadow);
        if replay {
            next.game_mut().context("Missing replay")?.idle_remaining = IDLE_TIMEOUT_MS;
        }
        let notice = if pregame && spectating && !self.spectating(session.user) {
            table_notice(
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
        if pregame
            && !spectating
            && session.active()
            && let Some(absent) = self.absent_players()
        {
            absent.remove(&session.user);
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
        if let Some(absent) = self.replay_absent() {
            *absent = None;
        }
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
                Status::Pregame
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
                        table_id: self.table.id,
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
                        table_id: self.table.id,
                        replay,
                        just_started: false,
                    },
                ),
            ));
        }
        self.spectator_messages(&mut e);
        self.publish(e).await
    }
    pub(super) async fn leave(&mut self, session: Arc<Session>, remove: bool) -> CommandResult<()> {
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
                notices.extend(table_notice(
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
                        table_id: self.table.id,
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
