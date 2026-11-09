use super::{
    Attendance, GameInfo, TableActor,
    wire::{game_action, game_action_list, int},
};
use crate::{
    model::{
        CLOCK_UNITS_PER_SECOND, IDLE_TIMEOUT_MS, MAX_NOTE_LENGTH, NoteOwner, Phase, wire_options,
    },
    transport::{Session, frame},
};
use anyhow::{Context, Result, ensure};
use hanabi_engine::{CompletionTiming, EndCondition, Recipient};
use hanabi_protocol::{
    ChatTyping, MIN_PLAYERS, NO_VALUE, ReplayAction, SafeInteger, Status, TableId, TableRequest,
};
use std::sync::Arc;

impl TableActor {
    pub(super) async fn action(&mut self, session: Arc<Session>, a: ReplayAction) -> Result<()> {
        ensure!(self.attending(&session), "Reattend before acting");
        let seat = self.seat(&session)?;
        let old = self.live()?;
        hanabi_engine::validate_action(&old.game.0, seat, &hanabi_engine::PlayerAction::from(&a))?;
        let from = old.game.events.len();
        let mut next = self.candidate();
        let s = next.game_mut().expect("game");
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
        if s.game.end_condition == EndCondition::InProgress && s.queued_pauses[active] {
            s.queued_pauses[active] = false;
            s.pause_player_index = hanabi_engine::int(active);
            s.game.paused = true;
        }
        self.persist(next).await?;
        self.transitions(from).await
    }
    pub(super) async fn transitions(&self, from: usize) -> Result<()> {
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
                    shadowing_player_index: a.shadow.map(hanabi_engine::int),
                }
            };
            for event in hanabi_engine::events_for_recipient(
                &s.game.0,
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
            let count = if s.game_id > 0 {
                self.store.seed_count(&s.seed).await?
            } else {
                0
            };
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
                            hanabi_protocol::server::GAME_HISTORY,
                            hanabi_protocol::GameHistoryList(vec![s.history(count, true)]),
                        ),
                    ));
                }
                e.messages.push((
                    a.session.clone(),
                    frame(
                        hanabi_protocol::server::FINISH_ONGOING_GAME,
                        hanabi_protocol::FinishOngoingGame {
                            table_id: TableId(self.table.id),
                            database_id: i64::from(s.game_id),
                            shared_replay_leader: self.leader_name(),
                        },
                    ),
                ));
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
                        hanabi_protocol::server::NOTE_LIST,
                        hanabi_protocol::NoteList {
                            table_id: TableId(self.table.id),
                            notes: self.observer_notes(a),
                        },
                    ),
                ));
            }
            self.add_all(&mut e, hanabi_protocol::server::CLOCK, self.clock());
        } else {
            self.add_all(&mut e, hanabi_protocol::server::CLOCK, self.clock());
            if s.game.paused {
                self.add_all(
                    &mut e,
                    hanabi_protocol::server::PAUSE,
                    hanabi_protocol::Pause {
                        table_id: TableId(self.table.id),
                        active: true,
                        player_index: i64::from(s.pause_player_index),
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
    pub(super) async fn terminate(&mut self, session: Arc<Session>, vote: bool) -> Result<()> {
        ensure!(self.attending(&session), "You are not attending");
        let seat = self.seat(&session)?;
        let from = self.live()?.game.events.len();
        let mut next = self.candidate();
        let s = next.game_mut().expect("game");
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
        self.persist(next).await?;
        let mut e = self.effects();
        if vote {
            e.messages.push((
                session,
                frame(
                    hanabi_protocol::server::VOTE_CHANGE,
                    hanabi_protocol::VoteChange {
                        vote: self.table.game().expect("game").votes[seat],
                    },
                ),
            ));
        }
        self.publish(e).await?;
        if terminate {
            self.transitions(from).await?;
        }
        Ok(())
    }
    /// A player keeps an idle game going, restarting its idle timer.
    pub(super) async fn idle_reset(&mut self, session: Arc<Session>) -> Result<()> {
        ensure!(self.attending(&session), "Not attending");
        self.seat(&session)?;
        self.live()?;
        let mut next = self.candidate();
        next.game_mut().context("Missing game")?.idle_remaining = IDLE_TIMEOUT_MS;
        // Like arrows and sounds, an idle reset only restarts the idle timer, so it skips the durable
        // write.
        self.apply_without_checkpoint(next)?;
        self.idle_warned = false;
        let mut e = self.effects();
        self.add_all(
            &mut e,
            hanabi_protocol::server::IDLE_RESET,
            TableRequest {
                table_id: TableId(self.table.id),
            },
        );
        self.publish(e).await
    }
    pub(super) async fn pause(
        &mut self,
        session: Arc<Session>,
        mut setting: hanabi_protocol::PauseSetting,
    ) -> Result<()> {
        use hanabi_protocol::PauseSetting as P;
        ensure!(self.attending(&session), "Not attending");
        let seat = self.seat(&session)?;
        let old = self.live()?;
        ensure!(old.game.options.timed, "This is not a timed game");
        if setting == P::PauseQueue && seat == old.game.active_player_index {
            setting = P::Pause;
        }
        ensure!(
            match setting {
                P::Pause => !old.game.paused,
                P::Unpause => old.game.paused,
                P::PauseQueue => !old.queued_pauses[seat],
                P::PauseUnqueue => old.queued_pauses[seat],
            },
            "Pause setting already applied"
        );
        let mut next = self.candidate();
        let s = next.game_mut().expect("game");
        match setting {
            P::PauseQueue | P::PauseUnqueue => s.queued_pauses[seat] = setting == P::PauseQueue,
            P::Pause | P::Unpause => {
                s.game.paused = setting == P::Pause;
                s.pause_player_index = if s.game.paused {
                    hanabi_engine::int(seat)
                } else {
                    NO_VALUE
                };
                if !s.game.paused {
                    s.turn_elapsed = 0;
                }
            }
        }
        self.persist(next).await?;
        let s = self.table.game().expect("game");
        let mut e = self.effects();
        if matches!(setting, P::Pause | P::Unpause) {
            self.add_all(
                &mut e,
                hanabi_protocol::server::PAUSE,
                hanabi_protocol::Pause {
                    table_id: TableId(self.table.id),
                    active: s.game.paused,
                    player_index: i64::from(s.pause_player_index),
                },
            );
            self.add_all(&mut e, hanabi_protocol::server::CLOCK, self.clock());
        }
        self.publish(e).await
    }
    pub(super) async fn note(
        &mut self,
        session: Arc<Session>,
        order: u64,
        note: &str,
    ) -> Result<()> {
        ensure!(self.attending(&session), "Not attending");
        self.live()?;
        let order = usize::try_from(order)?;
        let text = crate::accounts::truncate_to_max_bytes(note, MAX_NOTE_LENGTH);
        let text = crate::accounts::remove_disallowed_characters(text)
            .trim()
            .to_owned();
        ensure!(
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
        let s = next.game_mut().expect("game");
        let size = s.game.deck.len() + s.game.stacks.len();
        ensure!(order < size, "Invalid note order");
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
                    name: n.name,
                    is_spectator: n.is_spectator,
                })
                .collect();
            e.messages.push((
                a.session.clone(),
                frame(
                    hanabi_protocol::server::NOTE,
                    hanabi_protocol::Note {
                        table_id: TableId(self.table.id),
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
            if a.shadow.is_none_or(|shadow| shadow == i)
                || matches!(self.table.phase, Phase::Replay { .. })
            {
                notes.push(hanabi_protocol::PlayerNotes {
                    name: p.name.clone(),
                    notes: s.notes[i].clone(),
                    is_spectator: false,
                });
            }
        }
        for (id, n) in &s.spectator_notes {
            if *id == a.session.user || a.shadow.is_none() {
                notes.push(hanabi_protocol::PlayerNotes {
                    name: n.name.clone(),
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
                    name: spectator.session.name.clone(),
                    notes: vec![String::new(); s.game.deck.len() + s.game.stacks.len()],
                    is_spectator: true,
                });
            }
        }
        notes
    }
    pub(super) async fn info(&self, session: Arc<Session>, part: GameInfo) -> Result<()> {
        ensure!(
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
                table_id: TableId(self.table.id),
                player_names: s.players.iter().map(|p| p.name.clone()).collect(),
                our_player_index: int(a.shadow.or(display_seat).unwrap_or(0)),
                spectating: a.spectator && !replay,
                shadowing: a.shadow.is_some() && !replay,
                replay,
                database_id: if replay {
                    s.game_id.into()
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
                character_assignments: if s.game.options.detrimental_characters {
                    s.game
                        .players
                        .iter()
                        .map(|p| {
                            hanabi_engine::characters()
                                .iter()
                                .find(|c| c.name == p.character)
                                .map_or(SafeInteger(NO_VALUE.into()), |c| SafeInteger(c.id.into()))
                        })
                        .collect()
                } else {
                    vec![]
                },
                character_metadata: if s.game.options.detrimental_characters {
                    s.game
                        .players
                        .iter()
                        .map(|p| SafeInteger(p.character_metadata.into()))
                        .collect()
                } else {
                    vec![]
                },
                shared_replay,
                shared_replay_leader: self.leader_name(),
                shared_replay_segment: segment.into(),
                shared_replay_eff_mod: efficiency.into(),
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
                paused: s.game.paused,
                pause_player_index: s.pause_player_index.into(),
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
                    shadowing_player_index: a.shadow.map(hanabi_engine::int),
                }
            };
            let list = hanabi_engine::events_for_recipient(&s.game.0, recipient, None)?;
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
                            table_id: TableId(self.table.id),
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
                            table_id: TableId(self.table.id),
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
                    frame(hanabi_protocol::server::CLOCK, self.clock()),
                ));
            }
            self.chat_history(&mut e, &session)?;
            e.messages.push((
                session.clone(),
                frame(
                    hanabi_protocol::server::SPECTATORS,
                    hanabi_protocol::Spectators {
                        table_id: TableId(self.table.id),
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
                            table_id: TableId(self.table.id),
                            name: a.session.name.clone(),
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
                            actions: replay
                                .hypothetical_actions
                                .iter()
                                .map(|raw| hanabi_protocol::decode(&serde_json::from_str(raw)?))
                                .collect::<Result<_>>()
                                .context("Invalid stored hypothetical action")?,
                        },
                    ),
                ));
            }
        }
        self.publish(e).await
    }
}
