use super::request;
use super::table::wrong_phase;
use super::{
    Allocation, Effects, HubCommand, TableActor, TableChange,
    chat::{push_chat, server_chat, table_notice, truncate},
    setup::{
        load_replay, normalize_options, option_changes, options_suggestion, requested_extra,
        validate_table_name,
    },
};
use crate::errors::CommandResult;
use crate::errors::OrReject;
use crate::{
    game::Game,
    model::{
        CLOCK_UNITS_PER_SECOND, MAX_TABLE_NAME_LENGTH, Phase, Player, Snapshot, TableSnapshot,
        engine_options,
    },
    transport::{Session, frame},
};
use anyhow::Context;
use chrono::Utc;
use hanabi_engine::{GameSetup, Interpretation};
use hanabi_protocol::ClientMessage;
use hanabi_protocol::PlayerIndex;
use hanabi_protocol::UserId;
use hanabi_protocol::{Chat, MIN_PLAYERS, Status, TableRequest, TableStarted};
use std::{collections::HashSet, sync::Arc};

/// Appended to the name of a table that a split creates.
const SPLIT_SUFFIX: &str = " (split)";
/// The groups that the split command divides a pregame into: the players who stay and those who
/// move to a new table.
const SPLIT_GROUPS: usize = 2;

/// Posts that a pregame has a new owner.
pub(super) fn new_owner_notice(table: &mut TableSnapshot, name: &str) -> Option<Chat> {
    table_notice(
        table,
        &format!(
            "{} is the new table owner.",
            crate::accounts::escape_html(name)
        ),
    )
}

pub(super) fn remove_pregame_players(
    table: &mut TableSnapshot,
    removed: &HashSet<UserId>,
) -> Vec<Chat> {
    let Phase::Pregame { players, .. } = &mut table.phase else {
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
    let Some(first) = players.first() else {
        return vec![];
    };
    let new_owner = (!players.iter().any(|p| p.id == table.owner)).then(|| first.clone());
    if let Some(owner) = &new_owner {
        table.owner = owner.id;
    }
    for id in removed {
        table.shadows.remove(id);
    }
    let mut notices = names
        .into_iter()
        .filter_map(|name| {
            table_notice(
                table,
                &format!("{} left the game.", crate::accounts::escape_html(&name)),
            )
        })
        .collect::<Vec<_>>();
    if let Some(owner) = new_owner {
        notices.extend(new_owner_notice(table, &owner.name));
    }
    notices
}

impl TableActor {
    /// Runs a command that only a pregame accepts.
    pub(super) async fn pregame_command(
        &mut self,
        session: Arc<Session>,
        message: ClientMessage,
    ) -> CommandResult<()> {
        match message {
            ClientMessage::TableStart(r) => {
                let players = self.table.players();
                // A start based on a stale view of the table does nothing.
                if r.intended_player_names.as_ref().is_some_and(|names| {
                    names.len() != players.len() || players.iter().any(|p| !names.contains(&p.name))
                }) {
                    return Ok(());
                }
                self.start(session).await
            }
            ClientMessage::TableSetVariant(r) => {
                self.update(session, TableChange::Variant(r.options.variant_name))
                    .await
            }
            ClientMessage::TableUpdate(r) => {
                self.update(session, TableChange::Options(Box::new(r)))
                    .await
            }
            ClientMessage::TableTerminate(_) => {
                ensure_or_reject!(
                    self.attending(&session) && session.user == self.table.owner,
                    "Only owner can terminate"
                );
                self.retire().await
            }
            message => Err(wrong_phase(&message)),
        }
    }
    async fn update(&mut self, session: Arc<Session>, change: TableChange) -> CommandResult<()> {
        let (variant, request) = match change {
            TableChange::Variant(name) => (Some(name), None),
            TableChange::Options(request) => (None, Some(*request)),
        };
        let variant_only = variant.is_some();
        ensure_or_reject!(self.attending(&session), "You must attend this table");
        self.seat(&session)?;
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
            usize::from(
                request
                    .as_ref()
                    .map_or(hanabi_protocol::DEFAULT_MAX_PLAYERS, |r| r.max_players),
            )
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
            // A proposal is a message from its player, so it counts like one.
            self.admit_player_chat(session.user)?;
            let message = server_chat(
                self.table.id,
                &format!(
                    "{} proposes the following options:{changes}",
                    crate::accounts::escape_html(&session.name)
                ),
            );
            let mut next = self.candidate();
            push_chat(&mut next, [(crate::model::SERVER_AUTHOR, message.clone())])?;
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
        let Phase::Pregame { players, .. } = &mut next.phase else {
            bail_internal!("A pregame command ran outside a pregame");
        };
        let removed = players.split_off(players.len().min(max_players));
        crate::stats::refresh_players(&self.store.primary, players, variant.id).await?;
        ensure_or_reject!(
            session.active(),
            "Session changed while refreshing table options"
        );
        if players.iter().all(|p| p.id != next.owner) {
            next.owner = players[0].id;
        }
        let message = table_notice(
            &mut next,
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
                            table_id: self.table.id,
                        },
                    ),
                ));
            }
        }
        self.pregame_messages(&mut e);
        if let Some(message) = message {
            self.add_chat(&mut e, &message);
        }
        self.publish(e).await
    }
    pub(super) async fn start(&mut self, session: Arc<Session>) -> CommandResult<()> {
        ensure_or_reject!(
            self.attending(&session) && session.user == self.table.owner,
            "Only the attended owner can start"
        );
        let next = self.started(self.candidate(), &session).await?;
        self.persist(next).await?;
        let mut e = self.effects();
        self.start_messages(&mut e);
        self.publish(e).await
    }
    /// Starts the game of pregame table `next`, which `session`, its owner, starts. Returns the
    /// table with its game, for the caller to save.
    pub(super) async fn started(
        &self,
        mut next: TableSnapshot,
        session: &Session,
    ) -> CommandResult<TableSnapshot> {
        let players = next.players();
        ensure_or_reject!(
            hanabi_protocol::is_player_count(players.len()),
            "You need at least {MIN_PLAYERS} players"
        );
        ensure_or_reject!(
            next.extra
                .custom_num_players
                .is_none_or(|n| n == players.len()),
            "Custom game requires its original player count"
        );
        if next.extra.custom_num_players.is_some() {
            ensure_or_reject!(
                players.iter().all(|p| self
                    .attendees
                    .get(&p.id)
                    .is_some_and(|a| a.session.active() && !a.spectator)),
                "Custom games require all players present"
            );
        }
        let mut players = players.to_vec();
        let variant = hanabi_engine::get_variant(&next.options.variant_name)?;
        let seed = if let Some(seed) = &next.extra.custom_seed {
            seed.clone()
        } else {
            let prefix = crate::game::seed_prefix(players.len(), variant.id, &next.options);
            match &next.extra.set_seed_suffix {
                None => self.store.next_seed(&players, prefix).await?,
                Some(suffix) => prefix + suffix,
            }
        };
        let game_id = self.store.reserve().await?;
        let extra = &next.extra;
        // A replayed game keeps its seats; a new game shuffles them after the deck.
        let deck = hanabi_engine::prepare_deck_and_players(
            variant,
            &seed,
            &mut players,
            extra.custom_seed.is_none(),
        );
        ensure_or_reject!(session.active(), "Owner disconnected during start");
        let mut options = next.options.clone();
        options.num_players = players.len();
        let emulated = match extra.replay {
            Some(replay) => &extra.custom_actions[..replay.turns.min(extra.custom_actions.len())],
            None => &extra.custom_actions,
        };
        let game = Game::replay(
            GameSetup {
                options: options.clone(),
                player_names: players.iter().map(|p| p.name.clone()).collect(),
                seed: Some(seed),
                deck: Some(deck),
                characters: extra.custom_characters.clone(),
                interpretation: Interpretation::Live,
            },
            emulated,
        )?;
        let n = players.len();
        let snapshot = Snapshot {
            created: next.created,
            clocks: vec![
                if options.timed {
                    truncate(options.time_base * f64::from(CLOCK_UNITS_PER_SECOND))
                } else {
                    0
                };
                n
            ],
            ..Snapshot::new(
                next.id,
                Some(game_id),
                next.owner,
                next.name.clone(),
                players,
                game,
            )
        };
        next.options = options;
        next.phase = Phase::Live {
            snapshot: Box::new(snapshot),
            runtime: crate::model::LiveRuntime::default(),
        };
        Ok(next)
    }
    /// Tells the audience that the game started. Each attendee loads it again.
    pub(super) fn start_messages(&mut self, e: &mut Effects) {
        for a in self.attendees.values_mut() {
            a.loaded = false;
        }
        for a in self.audience() {
            e.statuses.push((
                a.session.clone(),
                if a.spectator {
                    Status::Spectating
                } else {
                    Status::Playing
                },
                Some(self.table.id),
            ));
            e.messages.push((
                a.session.clone(),
                frame(
                    hanabi_protocol::server::TABLE_STARTED,
                    TableStarted {
                        table_id: self.table.id,
                        stage: hanabi_protocol::GameStage::JustStarted,
                    },
                ),
            ));
        }
    }
    pub(super) async fn transfer(
        &mut self,
        source: TableSnapshot,
        destination: TableSnapshot,
        mut allocation: Allocation,
        moving: Vec<(Arc<Session>, bool, Option<PlayerIndex>)>,
        retire: bool,
        notices: Vec<Chat>,
    ) -> CommandResult<()> {
        let humans = destination
            .players()
            .iter()
            .filter(|p| !p.bot)
            .map(|p| p.id)
            .collect::<Vec<_>>();
        let reservation = request(&self.hub, |reply| HubCommand::ReserveSeats {
            users: humans,
            from: self.table.id,
            reply,
        })
        .await??;
        allocation.reservation = Some(reservation);
        // The source and its new table change in one commit.
        let destination_saved = self
            .persist_with(
                source,
                crate::store::Commit {
                    retire,
                    spawn: Some(&destination),
                    ..crate::store::Commit::default()
                },
            )
            .await?
            .spawn
            .context("Missing the split table's revision")?;
        allocation.revision = destination_saved.revision;
        allocation.preserve();
        let mut effects = self.effects();
        for (session, _, _) in &moving {
            self.attendees.remove(&session.user);
            effects.messages.push((
                session.clone(),
                frame(
                    hanabi_protocol::server::BOOT,
                    TableRequest {
                        table_id: self.table.id,
                    },
                ),
            ));
            effects
                .statuses
                .push((session.clone(), Status::Lobby, None));
        }
        self.pregame_messages(&mut effects);
        for notice in &notices {
            self.add_chat(&mut effects, notice);
        }
        self.publish(effects).await?;
        if retire {
            self.hub.send(HubCommand::Retire(self.table.id)).await?;
            self.retired = true;
        }
        self.hub
            .send(HubCommand::Spawn {
                table: Box::new(destination),
                saved: destination_saved,
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
    ) -> CommandResult<()> {
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
        let Phase::Pregame { players, .. } = &mut source.phase else {
            bail_internal!("A pregame command ran outside a pregame");
        };
        players.retain(|p| !selected_ids.contains(&p.id));
        let new_owner = players
            .first()
            .filter(|_| selected_ids.contains(&source.owner))
            .cloned();
        let retire = players.is_empty();
        if let Some(owner) = &new_owner {
            source.owner = owner.id;
        }
        let names = selected
            .iter()
            .map(|p| crate::accounts::escape_html(&p.name))
            .collect::<Vec<_>>()
            .join(", ");
        let mut notices = vec![];
        if !retire {
            notices.extend(table_notice(
                &mut source,
                &format!(
                    "{} split {names} into a new lobby.",
                    crate::accounts::escape_html(&session.name)
                ),
            ));
            if let Some(owner) = new_owner {
                notices.extend(new_owner_notice(&mut source, &owner.name));
            }
        }
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
            kicked: vec![],
            runtime: crate::model::PregameRuntime::default(),
        };
        destination.chat.clear();
        destination.shadows.clear();
        table_notice(
            &mut destination,
            &format!(
                "This lobby was created by splitting {}.",
                crate::accounts::escape_html(&self.table.name)
            ),
        );
        let moving = self
            .audience()
            .filter(|a| selected_ids.contains(&a.session.user))
            .map(|a| (a.session.clone(), false, None))
            .collect();
        self.transfer(source, destination, allocation, moving, retire, notices)
            .await
    }
}
