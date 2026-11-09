use super::{
    Allocation, HubCommand, PlayingClaim, TableActor, TableChange,
    chat::{membership_notice, server_chat, truncate},
    setup::{
        load_replay, normalize_options, option_changes, options_suggestion, requested_extra,
        validate_table_name,
    },
};
use crate::errors::OrReject;
use crate::{
    game::Game,
    model::{
        CLOCK_UNITS_PER_SECOND, FORMAT, IDLE_TIMEOUT_MS, MAX_TABLE_NAME_LENGTH, Phase, Player,
        Snapshot, TableChat, TableSnapshot, engine_options,
    },
    transport::{Session, frame},
};
use anyhow::{Context, Result};
use chrono::Utc;
use hanabi_engine::{EndCondition, GameSetup, Interpretation};
use hanabi_protocol::{Chat, MIN_PLAYERS, NO_VALUE, Status, TableId, TableRequest, TableStarted};
use std::{
    collections::{BTreeMap, HashSet},
    sync::Arc,
};
use tokio::sync::oneshot;

/// Appended to the name of a table that a split creates.
const SPLIT_SUFFIX: &str = " (split)";
/// The groups that the split command divides a pregame into: the players who stay and those who
/// move to a new table.
const SPLIT_GROUPS: usize = 2;

pub(super) fn remove_pregame_players(
    table: &mut TableSnapshot,
    removed: &HashSet<i32>,
) -> Vec<Chat> {
    let Phase::Pregame {
        players, countdown, ..
    } = &mut table.phase
    else {
        return vec![];
    };
    let names = players
        .iter()
        .filter(|p| removed.contains(&p.id))
        .map(|p| p.name.clone())
        .collect::<Vec<_>>();
    if names.is_empty() {
        return vec![];
    }
    players.retain(|p| !removed.contains(&p.id));
    *countdown = None;
    if players.is_empty() {
        return vec![];
    }
    if !players.iter().any(|p| p.id == table.owner) {
        table.owner = players[0].id;
    }
    for id in removed {
        table.shadows.remove(id);
    }
    names
        .into_iter()
        .filter_map(|name| {
            membership_notice(
                table,
                &format!("{} left the game.", crate::accounts::escape_html(&name)),
            )
        })
        .collect()
}

impl TableActor {
    pub(super) async fn update(
        &mut self,
        session: Arc<Session>,
        change: TableChange,
    ) -> Result<()> {
        let (variant, request) = match change {
            TableChange::Variant(name) => (Some(name), None),
            TableChange::Options(request) => (None, Some(*request)),
        };
        let variant_only = variant.is_some();
        ensure_or_reject!(self.attending(&session), "You must attend this table");
        self.seat(&session)?;
        ensure_or_reject!(
            matches!(self.table.phase, Phase::Pregame { .. }),
            "Game already started"
        );
        ensure_or_reject!(
            !variant_only || session.user == self.table.owner,
            "Only owner can change variant"
        );
        let mut options = if variant_only {
            self.table.options.clone()
        } else {
            engine_options(&request.as_ref().context("Missing options")?.options)
        };
        if let Some(variant) = &variant {
            options.variant_name.clone_from(variant);
        }
        normalize_options(&mut options)?;
        let mut name = if variant_only {
            self.table.name.clone()
        } else {
            crate::accounts::truncate_to_max_bytes(
                request.as_ref().map_or("", |r| r.name.as_str()),
                MAX_TABLE_NAME_LENGTH,
            )
            .trim()
            .to_owned()
        };
        if name.is_empty() {
            name = self.table.name.clone();
        }
        validate_table_name(&name)?;
        let mut max_players = if variant_only {
            self.table.max_players
        } else {
            request
                .as_ref()
                .and_then(|r| usize::try_from(r.max_players).ok())
                .filter(|n| hanabi_protocol::is_player_count(*n))
                .unwrap_or(usize::from(hanabi_protocol::DEFAULT_MAX_PLAYERS))
        };
        let mut extra = match &request {
            Some(r) if !variant_only => requested_extra(&r.options)?,
            _ => self.table.extra.clone(),
        };
        if !variant_only && session.user == self.table.owner {
            load_replay(
                &self.store,
                &mut extra,
                self.table.id,
                session.user,
                &mut options,
            )
            .await?;
        }
        let variant = hanabi_engine::get_variant(&options.variant_name)?;
        options.variant_id = Some(variant.id);
        max_players = max_players.max(extra.custom_num_players.unwrap_or(MIN_PLAYERS));
        if session.user != self.table.owner {
            let changes = option_changes(&self.table, &options, &name, max_players, &extra);
            ensure_or_reject!(!changes.is_empty(), "There are no new options proposed.");
            let message = server_chat(
                self.table.id,
                &format!(
                    "{} proposes the following options:{changes}",
                    crate::accounts::escape_html(&session.name)
                ),
            );
            let mut next = self.candidate();
            next.chat.push(TableChat {
                id: None,
                user: 0,
                message: message.clone(),
            });
            self.persist(next).await?;
            let mut e = self.effects();
            self.add_chat(&mut e, &message);
            if let Some(owner) = self.attendees.get(&self.table.owner) {
                let suggestion = options_suggestion(
                    self.table.id,
                    &owner.session.name,
                    &options,
                    &name,
                    max_players,
                    &extra,
                );
                e.messages.push((
                    owner.session.clone(),
                    frame(hanabi_protocol::server::CHAT, suggestion),
                ));
            }
            return self.publish(e).await;
        }
        let mut next = self.candidate();
        next.name = name;
        next.options = options;
        next.max_players = max_players;
        next.extra = extra;
        let Phase::Pregame {
            players,
            countdown,
            automatic_start,
            ..
        } = &mut next.phase
        else {
            unreachable!()
        };
        let removed = players.split_off(players.len().min(max_players));
        *countdown = None;
        *automatic_start = None;
        for player in players.iter_mut() {
            player.stats = self
                .store
                .player_for_variant(player.id, player.name.clone(), variant.id)
                .await?
                .stats;
        }
        ensure_or_reject!(
            session.active(),
            "Session changed while refreshing table options"
        );
        if players.iter().all(|p| p.id != next.owner) {
            next.owner = players[0].id;
        }
        let message = server_chat(
            self.table.id,
            &format!(
                "{} has changed {}.",
                crate::accounts::escape_html(&session.name),
                if variant_only {
                    "the variant"
                } else {
                    "game options"
                }
            ),
        );
        next.chat.push(TableChat {
            id: None,
            user: 0,
            message: message.clone(),
        });
        self.persist(next).await?;
        let mut e = self.effects();
        for p in removed {
            if let Some(a) = self.attendees.remove(&p.id) {
                e.statuses.push((a.session.clone(), Status::Lobby, None));
                e.messages.push((
                    a.session,
                    frame(
                        hanabi_protocol::server::BOOT,
                        TableRequest {
                            table_id: TableId(self.table.id),
                        },
                    ),
                ));
            }
        }
        self.pregame_messages(&mut e);
        self.add_chat(&mut e, &message);
        self.publish(e).await
    }
    pub(super) async fn start(&mut self, session: Arc<Session>) -> Result<()> {
        ensure_or_reject!(
            self.attending(&session) && session.user == self.table.owner,
            "Only the attended owner can start"
        );
        let Phase::Pregame { players, .. } = &self.table.phase else {
            reject!("Already started");
        };
        ensure_or_reject!(
            hanabi_protocol::is_player_count(players.len()),
            "You need at least {MIN_PLAYERS} players"
        );
        ensure_or_reject!(
            self.table
                .extra
                .custom_num_players
                .is_none_or(|n| n == players.len()),
            "Custom game requires its original player count"
        );
        if self.table.extra.custom_num_players.is_some() {
            ensure_or_reject!(
                players.iter().all(|p| self
                    .attendees
                    .get(&p.id)
                    .is_some_and(|a| a.session.active() && !a.spectator)),
                "Custom games require all players present"
            );
        }
        let mut players = players.clone();
        let variant = hanabi_engine::get_variant(&self.table.options.variant_name)?;
        let seed = if let Some(seed) = &self.table.extra.custom_seed {
            seed.clone()
        } else {
            let prefix = crate::game::seed_prefix(players.len(), variant.id, &self.table.options);
            match self.table.extra.set_seed_suffix.as_str() {
                "" => self.store.next_seed(&players, prefix).await?,
                suffix => prefix + suffix,
            }
        };
        let game_id = self.store.reserve().await?;
        let extra = &self.table.extra;
        // A replayed game keeps its seats; a new game shuffles them after the deck.
        let deck = hanabi_engine::prepare_deck_and_players(
            variant,
            &seed,
            &mut players,
            extra.custom_seed.is_none(),
        );
        ensure_or_reject!(session.active(), "Owner disconnected during start");
        let mut options = self.table.options.clone();
        options.num_players = players.len();
        let mut game = Game::create(GameSetup {
            options: options.clone(),
            player_names: players.iter().map(|p| p.name.clone()).collect(),
            seed: seed.clone(),
            deck: Some(deck),
            characters: extra.custom_characters.clone(),
            interpretation: Interpretation::Live,
        })?;
        let emulated = if extra.set_replay {
            &extra.custom_actions[..extra.set_replay_turn.min(extra.custom_actions.len())]
        } else {
            &extra.custom_actions
        };
        for a in emulated {
            if game.end_condition != EndCondition::InProgress {
                break;
            }
            let actor = game.active_player_index;
            if a.kind.is_game_over() {
                game.terminate(
                    actor,
                    EndCondition::try_from(a.value).map_err(anyhow::Error::msg)?,
                    a.target,
                    None,
                    None,
                )?;
            } else {
                game.apply(actor, *a)?;
            }
        }
        let now = Utc::now();
        let n = players.len();
        let size = game.deck.len() + game.stacks.len();
        let snapshot = Snapshot {
            format: FORMAT.into(),
            table_id: self.table.id,
            game_id,
            owner: self.table.owner,
            name: self.table.name.clone(),
            players,
            seed,
            created: self.table.created,
            started: now,
            finished: (game.end_condition != EndCondition::InProgress).then_some(now),
            game,
            clocks: vec![
                if options.timed {
                    truncate(options.time_base * f64::from(CLOCK_UNITS_PER_SECOND))
                } else {
                    0
                };
                n
            ],
            duration: 0,
            turn_elapsed: 0,
            timer_started: false,
            idle_remaining: IDLE_TIMEOUT_MS,
            pause_player_index: NO_VALUE,
            queued_pauses: vec![false; n],
            notes: vec![vec![String::new(); size]; n],
            spectator_notes: BTreeMap::new(),
            tags: vec![],
            votes: vec![false; n],
            maintenance_applied: false,
        };
        let mut next = self.candidate();
        next.options = options;
        next.phase = Phase::Live {
            snapshot: Box::new(snapshot),
        };
        self.persist(next).await?;
        for a in self.attendees.values_mut() {
            a.loaded = false;
        }
        let mut e = self.effects();
        let replay = matches!(self.table.phase, Phase::Replay { .. });
        for a in self.audience() {
            e.statuses.push((
                a.session.clone(),
                if replay {
                    Status::SharedReplay
                } else if a.spectator {
                    Status::Spectating
                } else {
                    Status::Playing
                },
                Some(self.table.id),
            ));
            e.messages.push((
                a.session.clone(),
                frame(
                    hanabi_protocol::server::TABLE_START,
                    TableStarted {
                        table_id: TableId(self.table.id),
                        replay,
                    },
                ),
            ));
        }
        self.publish(e).await
    }
    pub(super) async fn transfer(
        &mut self,
        mut source: TableSnapshot,
        destination: TableSnapshot,
        mut allocation: Allocation,
        moving: Vec<(Arc<Session>, bool, Option<usize>)>,
        retire: bool,
    ) -> Result<()> {
        let humans = destination
            .players()
            .iter()
            .filter(|p| !p.name.starts_with("Bot-"))
            .map(|p| p.id)
            .collect::<Vec<_>>();
        for user in &humans {
            allocation
                .playing_claims
                .push(PlayingClaim::acquire(&self.playing_claims, *user)?);
        }
        let (reply, received) = oneshot::channel();
        self.hub
            .send(HubCommand::CheckPlaying {
                users: humans,
                except: self.table.id,
                reply,
            })
            .await?;
        received.await??;
        source.pending_spawn = Some(Box::new(destination.clone()));
        source.retire_after_spawn = retire;
        // The source is the durable transfer journal. Recovery can finish a
        // destination reservation that had no payload when the process stopped.
        self.persist(source).await?;
        let destination_revision = match self.store.save(&destination, 0).await {
            Ok(r) => r,
            Err(e) => {
                self.frozen = true;
                return Err(e);
            }
        };
        allocation.revision = destination_revision;
        if retire {
            if let Err(e) = self.store.remove(self.table.id, self.revision).await {
                self.frozen = true;
                return Err(e);
            }
        } else {
            let mut final_source = self.table.clone();
            final_source.pending_spawn = None;
            final_source.retire_after_spawn = false;
            self.persist(final_source).await?;
        }
        allocation.preserve();
        let mut effects = self.effects();
        for (session, _, _) in &moving {
            self.attendees.remove(&session.user);
            effects.messages.push((
                session.clone(),
                frame(
                    hanabi_protocol::server::BOOT,
                    TableRequest {
                        table_id: TableId(self.table.id),
                    },
                ),
            ));
            effects
                .statuses
                .push((session.clone(), Status::Lobby, None));
        }
        self.pregame_messages(&mut effects);
        self.publish(effects).await?;
        if retire {
            self.hub.send(HubCommand::Retire(self.table.id)).await?;
            self.retired = true;
        }
        self.hub
            .send(HubCommand::Spawn {
                table: Box::new(destination),
                revision: destination_revision,
                allocation,
                chat_read: moving
                    .iter()
                    .filter_map(|(session, _, _)| {
                        self.chat_read
                            .get(&session.user)
                            .map(|read| (session.user, *read))
                    })
                    .collect(),
                attendees: moving,
            })
            .await?;
        Ok(())
    }
    pub(super) async fn split(
        &mut self,
        session: Arc<Session>,
        args: &[&str],
        automatic: bool,
    ) -> Result<()> {
        ensure_or_reject!(
            self.attending(&session) && session.user == self.table.owner,
            "Only owner can split"
        );
        let Phase::Pregame { players, .. } = &self.table.phase else {
            reject!("Split requires a pregame");
        };
        let selected = if automatic {
            ensure_or_reject!(
                players.len() >= SPLIT_GROUPS,
                "At least {SPLIT_GROUPS} players required"
            );
            let mut sorted = players.clone();
            sorted.sort_by_key(|p| std::cmp::Reverse(p.stats.num_games));
            let mid = sorted.len() / SPLIT_GROUPS;
            if sorted[..mid].iter().any(|p| p.id == self.table.owner) {
                sorted[mid..].to_vec()
            } else {
                sorted[..mid].to_vec()
            }
        } else {
            ensure_or_reject!(!args.is_empty(), "Expected /split [username] ...");
            let mut selected = vec![];
            for name in args {
                let player = players
                    .iter()
                    .find(|p| {
                        crate::accounts::normalize_string(&p.name)
                            == crate::accounts::normalize_string(name)
                    })
                    .or_reject("Unknown split player")?;
                ensure_or_reject!(
                    !selected.iter().any(|p: &Player| p.id == player.id),
                    "Duplicate split player"
                );
                selected.push(player.clone());
            }
            selected
        };
        ensure_or_reject!(
            !selected.is_empty() && selected.len() <= self.table.max_players,
            "Invalid split size"
        );
        let selected_ids = selected.iter().map(|p| p.id).collect::<HashSet<_>>();
        let allocation = self.allocation().await?;
        ensure_or_reject!(session.active(), "Owner changed while splitting");
        let mut source = self.candidate();
        let Phase::Pregame {
            players,
            countdown,
            automatic_start,
            ..
        } = &mut source.phase
        else {
            unreachable!()
        };
        players.retain(|p| !selected_ids.contains(&p.id));
        *countdown = None;
        *automatic_start = None;
        if selected_ids.contains(&source.owner)
            && let Some(p) = players.first()
        {
            source.owner = p.id;
        }
        let retire = players.is_empty();
        let mut destination = self.table.clone();
        destination.id = allocation.id;
        destination.name = format!(
            "{}{SPLIT_SUFFIX}",
            crate::accounts::truncate_to_max_bytes(
                self.table.name.trim(),
                MAX_TABLE_NAME_LENGTH - SPLIT_SUFFIX.len()
            )
        );
        destination.owner = selected[0].id;
        destination.created = Utc::now();
        destination.phase = Phase::Pregame {
            players: selected,
            automatic_start: None,
            countdown: None,
            kicked: vec![],
        };
        destination.chat.clear();
        destination.chat_archived = 0;
        destination.shadows.clear();
        let moving = self
            .audience()
            .filter(|a| selected_ids.contains(&a.session.user))
            .map(|a| (a.session.clone(), false, None))
            .collect();
        self.transfer(source, destination, allocation, moving, retire)
            .await
    }
}
