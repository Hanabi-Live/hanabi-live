use super::table::{game_mut, wrong_phase};
use super::{
    Attendance, GameInfo, Status, TableActor,
    chat::table_notice,
    wire::{game_event, game_events},
};
use crate::errors::CommandResult;
use crate::model::{Snapshot, TableSnapshot};
use crate::store::Commit;
use crate::{
    model::{CLOCK_UNITS_PER_SECOND, IDLE_TIMEOUT_MS, NoteOwner, Phase, wire_options},
    transport::{Session, frame},
};
use anyhow::Context;
use hanabi_engine::PlayerAction;
use hanabi_engine::{CompletionTiming, EndCondition, Recipient};
use hanabi_protocol::ClientMessage;
use hanabi_protocol::MAX_NOTE_LENGTH;
use hanabi_protocol::PlayerIndex;
use hanabi_protocol::{CardOrder, Chat, ChatTyping, MIN_PLAYERS, TableRef, ViewMode};
use std::sync::Arc;

/// What a `pause` or `pauseQueue` request changes.
#[derive(Clone, Copy, PartialEq, Eq)]
enum PauseChange {
    Paused(bool),
    Queued(bool),
}

impl TableActor {
    /// Runs a command that only a game in progress accepts.
    pub(super) async fn live_command(
        &mut self,
        session: Arc<Session>,
        message: ClientMessage,
    ) -> CommandResult<()> {
        match message {
            ClientMessage::PlayerAction(r) => self.action(session, r.action).await,
            ClientMessage::TableTerminate(_) => self.terminate(session, None).await,
            ClientMessage::TableTerminateVote(r) => self.terminate(session, Some(r.voted)).await,
            ClientMessage::Pause(r) => self.pause(session, PauseChange::Paused(r.paused)).await,
            ClientMessage::PauseQueue(r) => {
                self.pause(session, PauseChange::Queued(r.queued)).await
            }
            ClientMessage::IdleReset(_) => self.idle_reset(session).await,
            ClientMessage::Note(r) => self.note(session, r.order, &r.text).await,
            message @ (ClientMessage::TagAdd(_)
            | ClientMessage::TagRemove(_)
            | ClientMessage::TagRemoveAll(_)) => self.tag_message(session, message).await,
            message => Err(wrong_phase(&message)),
        }
    }
    /// The game in progress. Commands that use it run only while a game is live.
    fn live(&self) -> CommandResult<&Snapshot> {
        match &self.table.phase {
            Phase::Live { snapshot, .. } => Ok(snapshot),
            _ => bail_internal!("A live command ran outside a live game"),
        }
    }
    async fn action(&mut self, session: Arc<Session>, a: PlayerAction) -> CommandResult<()> {
        ensure_or_reject!(self.attending(&session), "Reattend before acting");
        let seat = self.seat(&session)?;
        let old = self.live()?;
        hanabi_engine::validate_action(old.game.state(), seat, &a)?;
        ensure_or_reject!(
            !old.paused(),
            "You cannot perform a game action when the game is paused."
        );
        let from = old.game.events.len();
        let mut next = self.candidate();
        let s = game_mut(&mut next)?;
        if let Some(time) = s.game.options.time_control {
            s.clocks[seat] += time.per_turn_seconds.get() * CLOCK_UNITS_PER_SECOND;
        }
        let timing = CompletionTiming {
            player_times: s.clocks.clone(),
            duration: s.duration,
        };
        s.game.apply_timed(seat, a, Some(timing))?;
        s.timer_started = true;
        s.turn_elapsed = 0;
        s.idle_remaining = IDLE_TIMEOUT_MS;
        s.maintenance_applied = false;
        let active = s.game.active_player_index;
        let mut paused_by = None;
        if s.game.end.is_none() && s.queued_pauses[active] {
            s.queued_pauses[active] = false;
            s.paused_by = PlayerIndex::new(active);
            paused_by = Some(s.players[active].name.clone());
        }
        let notice = paused_by.and_then(|name| self.pause_notice(&mut next, &name, true));
        self.persist_turn(next, from).await?;
        if let Some(notice) = notice {
            let mut e = self.effects();
            self.add_chat(&mut e, &notice);
            self.publish(e).await?;
        }
        Ok(())
    }
    /// Posts that a player paused or unpaused the game. Users who had read all of the chat also
    /// read the notice, since the game already shows the pause.
    fn pause_notice(&mut self, next: &mut TableSnapshot, name: &str, paused: bool) -> Option<Chat> {
        let read_all = next.chat.len();
        let notice = table_notice(
            next,
            &format!(
                "{} {}paused the game.",
                crate::accounts::escape_html(name),
                if paused { "" } else { "un" }
            ),
        )?;
        for read in self.chat_read.values_mut() {
            if *read == read_all {
                *read = next.chat.len();
            }
        }
        Some(notice)
    }
    /// Sends the game's events from position `from` on. For a game that just finished,
    /// `seed_games` is how many saved games use its seed, or `None` when it has no seed.
    pub(super) async fn transitions(
        &self,
        from: usize,
        seed_games: Option<i64>,
    ) -> CommandResult<()> {
        let s = self.table.game().context("Missing game")?;
        let replay = matches!(self.table.phase, Phase::Replay { .. });
        let mut e = self.effects();
        for a in self.audience().filter(|a| a.loaded || a.synced) {
            let recipient = if let Some(seat) = self
                .table
                .players()
                .iter()
                .position(|p| p.is(a.session.user))
            {
                Recipient::Player {
                    player_index: hanabi_engine::int(seat),
                }
            } else {
                Recipient::Spectator {
                    shadowing_player_index: a.shadow.map(i32::from),
                }
            };
            for event in hanabi_engine::events_for_recipient(
                s.game.state(),
                recipient,
                Some(&s.game.events[from..]),
            )? {
                e.messages.push((
                    a.session.clone(),
                    frame(
                        hanabi_protocol::server::GAME_EVENT,
                        game_event(self.table.id, &event),
                    ),
                ));
            }
        }
        if replay {
            self.spectator_messages(&mut e);
            let count = seed_games;
            for a in self.audience() {
                e.statuses.push((
                    a.session.clone(),
                    if self.table.visible {
                        Status::SharedReplay
                    } else {
                        Status::Replay
                    },
                    Some(self.table.id),
                ));
                if s.players.iter().any(|p| p.is(a.session.user))
                    && let Some(history) = s.history(count)
                {
                    e.messages.push((
                        a.session.clone(),
                        frame(hanabi_protocol::server::GAME_HISTORY_ADDED, history),
                    ));
                }
                // The client rebuilds the game when it finishes, which needs the identities of the
                // cards that were hidden from it.
                e.messages.push((
                    a.session.clone(),
                    frame(
                        hanabi_protocol::server::CARD_IDENTITIES,
                        self.card_identities(s),
                    ),
                ));
                e.messages.push((
                    a.session.clone(),
                    frame(
                        hanabi_protocol::server::GAME_FINISHED,
                        hanabi_protocol::GameFinished {
                            table_id: self.table.id,
                            game_id: s.game_id,
                            shared_replay: self
                                .shared_replay_state(s, &a.session)
                                .context("A finished game is not a shared replay")?,
                        },
                    ),
                ));
                e.messages.push((
                    a.session.clone(),
                    frame(
                        hanabi_protocol::server::NOTE_LIST,
                        hanabi_protocol::NoteList {
                            table_id: self.table.id,
                            notes: self.observer_notes(a),
                        },
                    ),
                ));
            }
            self.add_all(&mut e, hanabi_protocol::server::CLOCK, self.clock()?);
        } else {
            self.add_all(&mut e, hanabi_protocol::server::CLOCK, self.clock()?);
            if s.paused() {
                self.pause_messages(&mut e, s);
            }
        }
        self.publish(e).await
    }
    fn pause_message(&self, s: &Snapshot, session: &Session) -> crate::transport::Frame {
        frame(
            hanabi_protocol::server::PAUSE,
            hanabi_protocol::Pause {
                table_id: self.table.id,
                pause: pause_state(s, session),
            },
        )
    }
    /// Tells everyone at the table whether the game is paused.
    fn pause_messages(&self, e: &mut super::Effects, s: &Snapshot) {
        for a in self.audience() {
            e.messages
                .push((a.session.clone(), self.pause_message(s, &a.session)));
        }
    }
    /// Ends the game now, or with a `ballot`, casts or takes back the sender's vote to end it.
    async fn terminate(
        &mut self,
        session: Arc<Session>,
        ballot: Option<bool>,
    ) -> CommandResult<()> {
        let vote = ballot.is_some();
        ensure_or_reject!(self.attending(&session), "You are not attending");
        let seat = self.seat(&session)?;
        let from = self.live()?.game.events.len();
        let mut next = self.candidate();
        let s = game_mut(&mut next)?;
        let mut votes = None;
        let mut terminate = !vote;
        if let Some(voted) = ballot {
            s.votes[seat] = voted;
            let seats = s
                .votes
                .iter()
                .enumerate()
                .filter(|(_, v)| **v)
                .map(|(i, _)| i)
                .collect::<Vec<_>>();
            terminate = seats.len() >= votes_needed(s.players.len());
            votes = Some(seats);
        }
        if terminate {
            s.game.terminate(
                seat,
                if vote {
                    EndCondition::TerminatedByVote
                } else {
                    EndCondition::TerminatedByPlayer
                },
                (!vote).then_some(seat),
                votes,
                Some(CompletionTiming {
                    player_times: s.clocks.clone(),
                    duration: s.duration,
                }),
            )?;
        }
        let outcome = self.persist_with(next, Commit::default()).await?;
        let mut e = self.effects();
        // A vote that ends the game has already made it a replay. Only the voter learns of the vote:
        // the votes of others would tell a player what their teammates think of the game.
        if vote && !terminate {
            e.messages.push((
                session.clone(),
                frame(
                    hanabi_protocol::server::VOTES,
                    hanabi_protocol::Votes {
                        table_id: self.table.id,
                        votes: seat_votes(self.live()?, seat)?,
                    },
                ),
            ));
        }
        self.publish(e).await?;
        if terminate {
            self.transitions(from, outcome.seed_games).await?;
        }
        Ok(())
    }
    /// A player keeps an idle game going, restarting its idle timer.
    async fn idle_reset(&mut self, session: Arc<Session>) -> CommandResult<()> {
        ensure_or_reject!(self.attending(&session), "Not attending");
        self.seat(&session)?;
        self.live()?;
        let mut next = self.candidate();
        next.game_mut().context("Missing game")?.idle_remaining = IDLE_TIMEOUT_MS;
        // Like arrows and sounds, an idle reset only restarts the idle timer, so it skips the durable
        // write.
        self.apply_without_checkpoint(next)?;
        let mut e = self.effects();
        self.add_all(
            &mut e,
            hanabi_protocol::server::IDLE_RESET,
            TableRef {
                table_id: self.table.id,
            },
        );
        self.publish(e).await
    }
    async fn pause(&mut self, session: Arc<Session>, mut change: PauseChange) -> CommandResult<()> {
        ensure_or_reject!(self.attending(&session), "Not attending");
        let seat = self.seat(&session)?;
        let old = self.live()?;
        ensure_or_reject!(
            old.game.options.time_control.is_some(),
            "This is not a timed game"
        );
        if change == PauseChange::Queued(true) && seat == old.game.active_player_index {
            change = PauseChange::Paused(true);
        }
        ensure_or_reject!(
            match change {
                PauseChange::Paused(paused) => old.paused() != paused,
                PauseChange::Queued(queued) => old.queued_pauses[seat] != queued,
            },
            "Pause setting already applied"
        );
        let mut next = self.candidate();
        let s = game_mut(&mut next)?;
        let mut notice = None;
        match change {
            PauseChange::Queued(queued) => s.queued_pauses[seat] = queued,
            PauseChange::Paused(paused) => {
                s.paused_by = if paused { PlayerIndex::new(seat) } else { None };
                if !s.paused() {
                    s.turn_elapsed = 0;
                }
                let paused = s.paused();
                notice = self.pause_notice(&mut next, &session.name, paused);
            }
        }
        self.persist(next).await?;
        let s = self.live()?;
        let mut e = self.effects();
        if matches!(change, PauseChange::Paused(_)) {
            self.pause_messages(&mut e, s);
            self.add_all(&mut e, hanabi_protocol::server::CLOCK, self.clock()?);
        } else {
            e.messages
                .push((session.clone(), self.pause_message(s, &session)));
        }
        if let Some(notice) = notice {
            self.add_chat(&mut e, &notice);
        }
        self.publish(e).await
    }
    async fn note(
        &mut self,
        session: Arc<Session>,
        card: CardOrder,
        note: &str,
    ) -> CommandResult<()> {
        ensure_or_reject!(self.attending(&session), "Not attending");
        self.live()?;
        let order = card.index();
        let text = crate::accounts::truncate_to_max_chars(note, MAX_NOTE_LENGTH);
        let text = crate::accounts::remove_disallowed_characters(text)
            .trim()
            .to_owned();
        ensure_or_reject!(
            crate::accounts::max_consecutive_marks(&text) <= crate::accounts::MAX_CONSECUTIVE_MARKS,
            "Notes cannot contain more than {} consecutive diacritics.",
            crate::accounts::MAX_CONSECUTIVE_MARKS
        );
        let seat = self.table.players().iter().position(|p| p.is(session.user));
        let mut next = self.candidate();
        let s = game_mut(&mut next)?;
        let size = s.game.deck.len() + s.game.stacks.len();
        ensure_or_reject!(order < size, "Invalid note order");
        if let Some(seat) = seat {
            s.notes[seat][order] = text;
        } else {
            s.spectator_notes
                .entry(session.user)
                .or_insert_with(|| NoteOwner {
                    name: session.name.clone(),
                    notes: vec![String::new(); size],
                })
                .notes[order] = text;
        }
        self.persist(next).await?;
        let mut e = self.effects();
        for a in self.audience().filter(|a| a.spectator) {
            let notes = self
                .observer_notes(a)
                .into_iter()
                .map(|n| hanabi_protocol::AuthorNote {
                    text: n.notes.get(order).cloned().unwrap_or_default(),
                    username: n.username,
                    spectator: n.spectator,
                })
                .collect();
            e.messages.push((
                a.session.clone(),
                frame(
                    hanabi_protocol::server::NOTE,
                    hanabi_protocol::Note {
                        table_id: self.table.id,
                        order: card,
                        notes,
                    },
                ),
            ));
        }
        self.publish(e).await
    }
    pub(super) fn observer_notes(&self, a: &Attendance) -> Vec<hanabi_protocol::AuthorNotes> {
        let Some(s) = self.table.game() else {
            return vec![];
        };
        let mut notes = vec![];
        for (i, p) in s.players.iter().enumerate() {
            if a.shadow.is_none_or(|shadow| shadow.index() == i)
                || matches!(self.table.phase, Phase::Replay { .. })
            {
                notes.push(hanabi_protocol::AuthorNotes {
                    username: p.name.clone().into(),
                    notes: s.notes[i].clone(),
                    spectator: false,
                });
            }
        }
        for (id, n) in &s.spectator_notes {
            if *id == a.session.user || a.shadow.is_none() {
                notes.push(hanabi_protocol::AuthorNotes {
                    username: n.name.clone().into(),
                    notes: n.notes.clone(),
                    spectator: true,
                });
            }
        }
        for spectator in self
            .audience()
            .filter(|p| p.spectator && !s.spectator_notes.contains_key(&p.session.user))
        {
            if a.shadow.is_none() || spectator.session.user == a.session.user {
                notes.push(hanabi_protocol::AuthorNotes {
                    username: spectator.session.name.clone().into(),
                    notes: vec![String::new(); s.game.deck.len() + s.game.stacks.len()],
                    spectator: true,
                });
            }
        }
        notes
    }
    /// The state of the table's shared replay that `session` joins, or `None` if the table is not
    /// a shared replay.
    fn shared_replay_state(
        &self,
        s: &Snapshot,
        session: &Session,
    ) -> Option<hanabi_protocol::SharedReplayState> {
        let Phase::Replay { replay, .. } = &self.table.phase else {
            return None;
        };
        if !self.table.visible {
            return None;
        }
        Some(hanabi_protocol::SharedReplayState {
            owner: self.table.owner.clone(),
            turn: replay.segment,
            efficiency_modifier: replay.efficiency_modifier,
            spoiler_free: replay.spoiler_free,
            restart_declined: self.restart_declined_seats(),
            can_play_again: self.can_play_again(session),
            // A review of a game just played begins when the game ends; a replay of an older
            // game begins when its table is created.
            replay_started_at: hanabi_protocol::Timestamp::from(
                s.finished
                    .map_or(self.table.created, |f| f.max(self.table.created)),
            ),
        })
    }
    pub(super) async fn info(&self, session: Arc<Session>, part: GameInfo) -> CommandResult<()> {
        ensure_or_reject!(
            self.attending(&session),
            "Reattend before requesting private game data"
        );
        let s = self.table.game().context("No available game")?;
        let a = self.attendees.get(&session.user).expect("attendee");
        let replay = matches!(self.table.phase, Phase::Replay { .. });
        let seat = s.players.iter().position(|p| p.is(session.user));
        let display_seat = seat.or_else(|| s.players.iter().position(|p| p.name == session.name));
        let mut e = self.effects();
        if part == GameInfo::Init {
            let shared_replay = self.shared_replay_state(s, &session);
            let our_player_index = a.shadow.or_else(|| display_seat.and_then(PlayerIndex::new));
            let init = hanabi_protocol::GameInit {
                table_id: self.table.id,
                player_names: s.players.iter().map(|p| p.name.as_str().into()).collect(),
                mode: match (shared_replay, a.shadow) {
                    (Some(shared_replay), _) => ViewMode::SharedReplay {
                        game_id: s.game_id,
                        our_player_index,
                        shared_replay,
                    },
                    (None, _) if replay => ViewMode::Replay {
                        game_id: s.game_id,
                        our_player_index,
                    },
                    (None, Some(our_player_index)) => ViewMode::Shadowing { our_player_index },
                    (None, None) if a.spectator => ViewMode::Spectating {},
                    (None, None) => ViewMode::Playing {
                        our_player_index: our_player_index.context("Missing player")?,
                    },
                },
                custom_seed: self.table.extra.custom_seed.is_some(),
                seed: s.seed.clone().map(Into::into),
                started_at: hanabi_protocol::Timestamp::from(s.started),
                finished_at: s.finished.map(hanabi_protocol::Timestamp::from),
                options: wire_options(&s.game.options),
                characters: if s.game.options.detrimental_characters {
                    s.game
                        .players
                        .iter()
                        .map(|p| {
                            crate::game::character_assignment(
                                p.character().context("A player has no character")?,
                                p.assigned_value(),
                            )
                        })
                        .collect::<anyhow::Result<_>>()?
                } else {
                    vec![]
                },
            };
            e.messages.push((
                session.clone(),
                frame(hanabi_protocol::server::GAME_INIT, init),
            ));
        } else {
            let recipient = if replay {
                Recipient::Spectator {
                    shadowing_player_index: None,
                }
            } else if !a.spectator {
                Recipient::Player {
                    player_index: hanabi_engine::int(seat.context("Missing player")?),
                }
            } else {
                Recipient::Spectator {
                    shadowing_player_index: a.shadow.map(i32::from),
                }
            };
            let list = hanabi_engine::events_for_recipient(s.game.state(), recipient, None)?;
            // A player of a game in progress sees only their own notes and votes.
            let player_seat = seat.filter(|_| !replay && !a.spectator);
            let notes = if replay || a.spectator {
                self.observer_notes(a)
            } else {
                player_seat
                    .map(|seat| hanabi_protocol::AuthorNotes {
                        username: s.players[seat].name.as_str().into(),
                        notes: s.notes[seat].clone(),
                        spectator: false,
                    })
                    .into_iter()
                    .collect()
            };
            let state = hanabi_protocol::GameState {
                table_id: self.table.id,
                events: game_events(&list),
                deck: replay.then(|| self.card_identities(s).deck),
                notes,
                votes: player_seat.map(|seat| seat_votes(s, seat)).transpose()?,
                connected: (!replay).then(|| self.connected().connected),
                clock: if replay {
                    None
                } else {
                    Some(self.clock()?.clock)
                },
                pause: (!replay).then(|| pause_state(s, &session)),
                spectators: self.spectators(),
                hypothetical: match &self.table.phase {
                    Phase::Replay { replay, .. } if replay.hypothetical => {
                        Some(hanabi_protocol::ActiveHypothetical {
                            show_drawn_cards: replay.show_drawn_cards,
                            events: replay.hypothetical_actions.clone(),
                        })
                    }
                    _ => None,
                },
            };
            e.messages.push((
                session.clone(),
                frame(hanabi_protocol::server::GAME_STATE, state),
            ));
            self.chat_history(&mut e, &session)?;
            for a in self
                .audience()
                .filter(|a| a.session.user != session.user && a.typing_until.is_some())
            {
                e.messages.push((
                    session.clone(),
                    frame(
                        hanabi_protocol::server::CHAT_TYPING,
                        ChatTyping {
                            table_id: self.table.id,
                            username: a.session.name.clone().into(),
                            typing: true,
                        },
                    ),
                ));
            }
        }
        self.publish(e).await
    }
}

/// How many votes end a game with this many players.
fn votes_needed(players: usize) -> usize {
    if players == MIN_PLAYERS {
        // A majority of two players would let either one end the game alone.
        players
    } else {
        players.div_ceil(2)
    }
}

/// Whether the game is paused, as the user in `session` sees it.
fn pause_state(s: &Snapshot, session: &Session) -> hanabi_protocol::PauseState {
    hanabi_protocol::PauseState {
        pausing_player_index: s.paused_by,
        queued: s
            .players
            .iter()
            .position(|p| p.is(session.user))
            .is_some_and(|seat| s.queued_pauses[seat]),
    }
}

fn seat_votes(s: &Snapshot, seat: usize) -> anyhow::Result<hanabi_protocol::VoteState> {
    Ok(hanabi_protocol::VoteState {
        voted: s.votes[seat],
        num_votes_needed: hanabi_protocol::VoteCount::new(votes_needed(s.players.len()))
            .context("Too many votes needed")?,
    })
}
