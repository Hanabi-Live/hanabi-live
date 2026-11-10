use super::table::{game_mut, wrong_phase};
use super::{
    Attendance, GameInfo, TableActor,
    chat::table_notice,
    wire::{game_action, game_action_list, int},
};
use crate::errors::CommandResult;
use crate::model::{Seat, Snapshot, TableSnapshot};
use crate::store::Commit;
use crate::{
    model::{
        CLOCK_UNITS_PER_SECOND, IDLE_TIMEOUT_MS, MAX_NOTE_LENGTH, NoteOwner, Phase, wire_options,
    },
    transport::{Session, frame},
};
use anyhow::Context;
use hanabi_engine::{CompletionTiming, EndCondition, Recipient};
use hanabi_protocol::ClientMessage;
use hanabi_protocol::{
    Chat, ChatTyping, MIN_PLAYERS, NO_VALUE, ReplayAction, Status, TableRequest,
};
use std::sync::Arc;

impl TableActor {
    /// Runs a command that only a game in progress accepts.
    pub(super) async fn live_command(
        &mut self,
        session: Arc<Session>,
        message: ClientMessage,
    ) -> CommandResult<()> {
        match message {
            ClientMessage::Action(r) => {
                let action = ReplayAction {
                    kind: r.kind.into(),
                    target: r.target,
                    value: r.value,
                };
                self.action(session, action).await
            }
            ClientMessage::TableTerminate(_) => self.terminate(session, false).await,
            ClientMessage::TableVoteForTermination(_) => self.terminate(session, true).await,
            ClientMessage::Pause(r) => self.pause(session, r.setting).await,
            ClientMessage::IdleReset(_) => self.idle_reset(session).await,
            ClientMessage::Note(r) => self.note(session, r.order, &r.note).await,
            message @ (ClientMessage::Tag(_)
            | ClientMessage::TagDelete(_)
            | ClientMessage::TagsDeleteAll(_)) => self.tag_message(session, message).await,
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
    async fn action(&mut self, session: Arc<Session>, a: ReplayAction) -> CommandResult<()> {
        ensure_or_reject!(self.attending(&session), "Reattend before acting");
        let seat = self.seat(&session)?;
        let old = self.live()?;
        hanabi_engine::validate_action(
            old.game.state(),
            seat,
            &hanabi_engine::PlayerAction::from(&a),
        )?;
        ensure_or_reject!(
            !old.paused(),
            "You cannot perform a game action when the game is paused."
        );
        let from = old.game.events.len();
        let mut next = self.candidate();
        let s = game_mut(&mut next)?;
        if s.game.options.timed {
            s.clocks[seat] += s.game.options.time_per_turn * i64::from(CLOCK_UNITS_PER_SECOND);
        }
        let timing = CompletionTiming {
            player_times: s.clocks.clone(),
            duration: s.duration,
        };
        s.game.apply_timed(seat, &a, Some(timing))?;
        s.timer_started = true;
        s.turn_elapsed = 0;
        s.idle_remaining = IDLE_TIMEOUT_MS;
        s.maintenance_applied = false;
        let active = s.game.active_player_index;
        let mut paused_by = None;
        if s.game.end_condition == EndCondition::InProgress && s.queued_pauses[active] {
            s.queued_pauses[active] = false;
            s.paused_by = Seat::new(active);
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
    /// `seed_games` is how many saved games use its seed.
    pub(super) async fn transitions(&self, from: usize, seed_games: i64) -> CommandResult<()> {
        let s = self.table.game().context("Missing game")?;
        let replay = matches!(self.table.phase, Phase::Replay { .. });
        let mut e = self.effects();
        for a in self.audience().filter(|a| a.loaded) {
            let recipient = if let Some(seat) = self
                .table
                .players()
                .iter()
                .position(|p| p.id == a.session.user)
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
                        hanabi_protocol::server::GAME_ACTION,
                        game_action(self.table.id, &event),
                    ),
                ));
            }
        }
        if replay {
            self.add_all(&mut e, hanabi_protocol::server::CONNECTED, self.connected());
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
                if s.players.iter().any(|p| p.id == a.session.user) {
                    e.messages.push((
                        a.session.clone(),
                        frame(
                            hanabi_protocol::server::GAME_HISTORY_ADDED,
                            s.history(count),
                        ),
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
                        hanabi_protocol::server::FINISH_ONGOING_GAME,
                        hanabi_protocol::FinishOngoingGame {
                            table_id: self.table.id,
                            database_id: i64::from(s.game_id.0),
                            shared_replay_leader: self.leader_name(),
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
                self.add_all(
                    &mut e,
                    hanabi_protocol::server::PAUSE,
                    hanabi_protocol::Pause {
                        table_id: self.table.id,
                        active: true,
                        player_index: Seat::wire(s.paused_by),
                    },
                );
            }
        }
        self.publish(e).await
    }
    pub(super) fn leader_name(&self) -> String {
        self.attendees
            .get(&self.table.owner)
            .map(|a| a.session.name.clone())
            .or_else(|| {
                self.table
                    .players()
                    .iter()
                    .find(|p| p.id == self.table.owner)
                    .map(|p| p.name.clone())
            })
            .unwrap_or_default()
    }
    async fn terminate(&mut self, session: Arc<Session>, vote: bool) -> CommandResult<()> {
        ensure_or_reject!(self.attending(&session), "You are not attending");
        let seat = self.seat(&session)?;
        let from = self.live()?.game.events.len();
        let mut next = self.candidate();
        let s = game_mut(&mut next)?;
        let mut votes = None;
        let mut terminate = !vote;
        if vote {
            s.votes[seat] = !s.votes[seat];
            let seats = s
                .votes
                .iter()
                .enumerate()
                .filter(|(_, v)| **v)
                .map(|(i, _)| i)
                .collect::<Vec<_>>();
            terminate = if s.players.len() == MIN_PLAYERS {
                // A majority of two players would let either one end the game alone.
                seats.len() == s.players.len()
            } else {
                seats.len() * 2 >= s.players.len()
            };
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
                if vote {
                    NO_VALUE
                } else {
                    hanabi_engine::int(seat)
                },
                votes,
                Some(CompletionTiming {
                    player_times: s.clocks.clone(),
                    duration: s.duration,
                }),
            )?;
        }
        let outcome = self.persist_with(next, Commit::default()).await?;
        let mut e = self.effects();
        if vote {
            e.messages.push((
                session,
                frame(
                    hanabi_protocol::server::VOTE_CHANGE,
                    hanabi_protocol::VoteChange {
                        // A vote that ends the game has already made it a replay.
                        vote: self
                            .table
                            .game()
                            .context("A vote was counted without a game")?
                            .votes[seat],
                    },
                ),
            ));
        }
        self.publish(e).await?;
        if terminate {
            self.transitions(from, outcome.seed_games.unwrap_or(0))
                .await?;
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
            TableRequest {
                table_id: self.table.id,
            },
        );
        self.publish(e).await
    }
    async fn pause(
        &mut self,
        session: Arc<Session>,
        mut setting: hanabi_protocol::PauseSetting,
    ) -> CommandResult<()> {
        use hanabi_protocol::PauseSetting as P;
        ensure_or_reject!(self.attending(&session), "Not attending");
        let seat = self.seat(&session)?;
        let old = self.live()?;
        ensure_or_reject!(old.game.options.timed, "This is not a timed game");
        if setting == P::PauseQueue && seat == old.game.active_player_index {
            setting = P::Pause;
        }
        ensure_or_reject!(
            match setting {
                P::Pause => !old.paused(),
                P::Unpause => old.paused(),
                P::PauseQueue => !old.queued_pauses[seat],
                P::PauseUnqueue => old.queued_pauses[seat],
            },
            "Pause setting already applied"
        );
        let mut next = self.candidate();
        let s = game_mut(&mut next)?;
        let mut notice = None;
        match setting {
            P::PauseQueue | P::PauseUnqueue => s.queued_pauses[seat] = setting == P::PauseQueue,
            P::Pause | P::Unpause => {
                s.paused_by = if setting == P::Pause {
                    Seat::new(seat)
                } else {
                    None
                };
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
        if matches!(setting, P::Pause | P::Unpause) {
            self.add_all(
                &mut e,
                hanabi_protocol::server::PAUSE,
                hanabi_protocol::Pause {
                    table_id: self.table.id,
                    active: s.paused(),
                    player_index: Seat::wire(s.paused_by),
                },
            );
            self.add_all(&mut e, hanabi_protocol::server::CLOCK, self.clock()?);
        }
        if let Some(notice) = notice {
            self.add_chat(&mut e, &notice);
        }
        self.publish(e).await
    }
    async fn note(&mut self, session: Arc<Session>, order: u64, note: &str) -> CommandResult<()> {
        ensure_or_reject!(self.attending(&session), "Not attending");
        self.live()?;
        let order = usize::try_from(order)?;
        let text = crate::accounts::truncate_to_max_bytes(note, MAX_NOTE_LENGTH);
        let text = crate::accounts::remove_disallowed_characters(text)
            .trim()
            .to_owned();
        ensure_or_reject!(
            crate::accounts::max_consecutive_marks(&text) <= crate::accounts::MAX_CONSECUTIVE_MARKS,
            "Notes cannot contain more than {} consecutive diacritics.",
            crate::accounts::MAX_CONSECUTIVE_MARKS
        );
        let seat = self
            .table
            .players()
            .iter()
            .position(|p| p.id == session.user);
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
                .map(|n| hanabi_protocol::CardNote {
                    text: n.notes.get(order).cloned().unwrap_or_default(),
                    username: n.username,
                    is_spectator: n.is_spectator,
                })
                .collect();
            e.messages.push((
                a.session.clone(),
                frame(
                    hanabi_protocol::server::NOTE,
                    hanabi_protocol::Note {
                        table_id: self.table.id,
                        order: i64::try_from(order)?,
                        notes,
                    },
                ),
            ));
        }
        self.publish(e).await
    }
    pub(super) fn observer_notes(&self, a: &Attendance) -> Vec<hanabi_protocol::PlayerNotes> {
        let Some(s) = self.table.game() else {
            return vec![];
        };
        let mut notes = vec![];
        for (i, p) in s.players.iter().enumerate() {
            if a.shadow.is_none_or(|shadow| shadow.index() == i)
                || matches!(self.table.phase, Phase::Replay { .. })
            {
                notes.push(hanabi_protocol::PlayerNotes {
                    username: p.name.clone(),
                    notes: s.notes[i].clone(),
                    is_spectator: false,
                });
            }
        }
        for (id, n) in &s.spectator_notes {
            if *id == a.session.user || a.shadow.is_none() {
                notes.push(hanabi_protocol::PlayerNotes {
                    username: n.name.clone(),
                    notes: n.notes.clone(),
                    is_spectator: true,
                });
            }
        }
        for spectator in self
            .audience()
            .filter(|p| p.spectator && !s.spectator_notes.contains_key(&p.session.user))
        {
            if a.shadow.is_none() || spectator.session.user == a.session.user {
                notes.push(hanabi_protocol::PlayerNotes {
                    username: spectator.session.name.clone(),
                    notes: vec![String::new(); s.game.deck.len() + s.game.stacks.len()],
                    is_spectator: true,
                });
            }
        }
        notes
    }
    pub(super) async fn info(&self, session: Arc<Session>, part: GameInfo) -> CommandResult<()> {
        ensure_or_reject!(
            self.attending(&session),
            "Reattend before requesting private game data"
        );
        let s = self.table.game().context("No available game")?;
        let a = self.attendees.get(&session.user).expect("attendee");
        let replay = matches!(self.table.phase, Phase::Replay { .. });
        let seat = s.players.iter().position(|p| p.id == session.user);
        let display_seat = seat.or_else(|| s.players.iter().position(|p| p.name == session.name));
        let mut e = self.effects();
        if part == GameInfo::Init {
            let (segment, efficiency, spoiler_free) =
                if let Phase::Replay { replay, .. } = &self.table.phase {
                    (
                        replay.segment,
                        replay.efficiency_modifier,
                        replay.spoiler_free,
                    )
                } else {
                    (s.game.turn, 0, false)
                };
            let shared_replay = replay && self.table.visible;
            let init = hanabi_protocol::Init {
                table_id: self.table.id,
                player_names: s.players.iter().map(|p| p.name.clone()).collect(),
                our_player_index: int(a.shadow.map(Seat::index).or(display_seat).unwrap_or(0)),
                spectating: a.spectator && !replay,
                shadowing: a.shadow.is_some() && !replay,
                replay,
                database_id: if replay {
                    s.game_id.0.into()
                } else {
                    NO_VALUE.into()
                },
                has_custom_seed: self.table.extra.custom_seed.is_some(),
                seed: s.seed.clone(),
                datetime_started: crate::model::timestamp(s.started),
                datetime_finished: s.finished.map_or_else(
                    || hanabi_protocol::UNFINISHED_DATETIME.into(),
                    crate::model::timestamp,
                ),
                options: wire_options(&s.game.options),
                characters: if s.game.options.detrimental_characters {
                    s.game
                        .players
                        .iter()
                        .map(|p| hanabi_protocol::CharacterAssignment {
                            character_id: hanabi_engine::characters()
                                .iter()
                                .find(|c| c.name == p.character)
                                .map(|c| c.id),
                            metadata: p.character_metadata,
                        })
                        .collect()
                } else {
                    vec![]
                },
                shared_replay,
                shared_replay_leader: self.leader_name(),
                shared_replay_segment: segment.into(),
                shared_replay_efficiency_modifier: efficiency.into(),
                spoiler_free,
                restart_declined: self.restart_declined_names(),
                // A review of a game just played begins when the game ends; a replay of an older
                // game begins when its table is created.
                datetime_shared_replay_started: shared_replay.then(|| {
                    crate::model::timestamp(
                        s.finished
                            .map_or(self.table.created, |f| f.max(self.table.created)),
                    )
                }),
                paused: s.paused(),
                pause_player_index: Seat::wire(s.paused_by),
                pause_queued: seat.is_some_and(|i| s.queued_pauses[i]),
            };
            e.messages
                .push((session.clone(), frame(hanabi_protocol::server::INIT, init)));
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
            e.messages.push((
                session.clone(),
                frame(
                    hanabi_protocol::server::GAME_ACTION_LIST,
                    game_action_list(self.table.id, &list),
                ),
            ));
            if replay {
                e.messages.push((
                    session.clone(),
                    frame(
                        hanabi_protocol::server::CARD_IDENTITIES,
                        self.card_identities(s),
                    ),
                ));
            }
            if replay || a.spectator {
                e.messages.push((
                    session.clone(),
                    frame(
                        hanabi_protocol::server::NOTE_LIST,
                        hanabi_protocol::NoteList {
                            table_id: self.table.id,
                            notes: self.observer_notes(a),
                        },
                    ),
                ));
            } else if let Some(seat) = seat {
                e.messages.push((
                    session.clone(),
                    frame(
                        hanabi_protocol::server::NOTE_LIST_PLAYER,
                        hanabi_protocol::NoteListPlayer {
                            table_id: self.table.id,
                            notes: s.notes[seat].clone(),
                        },
                    ),
                ));
                e.messages.push((
                    session.clone(),
                    frame(
                        hanabi_protocol::server::VOTE_CHANGE,
                        hanabi_protocol::VoteChange {
                            vote: s.votes[seat],
                        },
                    ),
                ));
            }
            e.messages.push((
                session.clone(),
                frame(hanabi_protocol::server::CONNECTED, self.connected()),
            ));
            if !replay {
                e.messages.push((
                    session.clone(),
                    frame(hanabi_protocol::server::CLOCK, self.clock()?),
                ));
            }
            self.chat_history(&mut e, &session)?;
            e.messages.push((
                session.clone(),
                frame(
                    hanabi_protocol::server::SPECTATORS,
                    hanabi_protocol::Spectators {
                        table_id: self.table.id,
                        spectators: self.spectators(),
                    },
                ),
            ));
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
                            username: a.session.name.clone(),
                            typing: true,
                        },
                    ),
                ));
            }
            if let Phase::Replay { replay, .. } = &self.table.phase
                && replay.hypothetical
            {
                e.messages.push((
                    session,
                    frame(
                        hanabi_protocol::server::HYPOTHETICAL,
                        hanabi_protocol::Hypothetical {
                            show_drawn_cards: replay.show_drawn_cards,
                            actions: replay.hypothetical_actions.clone(),
                        },
                    ),
                ));
            }
        }
        self.publish(e).await
    }
}
