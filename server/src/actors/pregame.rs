use super::request;
use super::table::wrong_phase;
use super::{
    Allocation, Effects, HubCommand, Status, TableActor,
    chat::{push_chat, server_chat, table_notice},
    setup::{
        load_replay, normalize_options, option_changes, options_suggestion, requested_extra,
        table_name,
    },
};
use crate::errors::CommandResult;
use crate::errors::OrReject;
use crate::{
    game::Game,
    model::{MS_PER_SECOND, Phase, Player, Snapshot, TableSnapshot, engine_options},
    transport::{Session, frame},
};
use anyhow::Context;
use chrono::Utc;
use hanabi_engine::{GameSetup, Interpretation};
use hanabi_protocol::ClientRequest;
use hanabi_protocol::PlayerIndex;
use hanabi_protocol::UserId;
use hanabi_protocol::{
    Chat, MAX_TABLE_NAME_LENGTH, MIN_PLAYERS, TableJoined, TableRef, TableStage,
};
use std::{collections::HashSet, sync::Arc};

/// Appended to the name of a table that a split creates.
const SPLIT_SUFFIX: &str = " (split)";
/// The groups that the split command divides a pregame into: the players who stay and those who
/// move to a new table.
const SPLIT_GROUPS: usize = 2;

/// Posts that a pregame has a new owner.
pub(super) fn new_owner_notice(table: &mut TableSnapshot, name: &str) -> Option<Chat> {
    table_notice(table, &format!("{name} is the new table owner."))
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
        .filter(|p| p.id.is_some_and(|id| removed.contains(&id)))
        .map(|p| p.name.clone())
        .collect::<Vec<_>>();
    if names.is_empty() {
        return vec![];
    }
    players.retain(|p| !p.id.is_some_and(|id| removed.contains(&id)));
    let Some(first) = players.first() else {
        return vec![];
    };
    let new_owner = (!players.iter().any(|p| p.is(table.owner.user_id))).then(|| first.clone());
    if let Some(owner) = new_owner.as_ref().and_then(|owner| owner.user_ref().ok()) {
        table.owner = owner;
    }
    for id in removed {
        table.shadows.remove(id);
    }
    let mut notices = names
        .into_iter()
        .filter_map(|name| table_notice(table, &format!("{name} left the game.")))
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
        message: ClientRequest,
    ) -> CommandResult<()> {
        match message {
            ClientRequest::TableStart(r) => {
                let players = self.table.players();
                // A start based on a stale view of the table does nothing.
                let ids = &r.intended_player_ids;
                if ids.len() != players.len()
                    || players
                        .iter()
                        .any(|p| !p.id.is_some_and(|id| ids.contains(&id)))
                {
                    return Ok(());
                }
                self.start(session).await
            }
            ClientRequest::TableUpdate(r) => self.update(session, r).await,
            ClientRequest::TableTerminate(_) => {
                ensure_or_reject!(
                    self.attending(&session) && session.user == self.table.owner.user_id,
                    "Only owner can terminate"
                );
                self.retire().await
            }
            message => Err(wrong_phase(&message)),
        }
    }
    async fn update(
        &mut self,
        session: Arc<Session>,
        request: hanabi_protocol::TableUpdateRequest,
    ) -> CommandResult<()> {
        ensure_or_reject!(self.attending(&session), "You must attend this table");
        self.seat(&session)?;
        let mut options = engine_options(&request.settings.options)?;
        normalize_options(&mut options)?;
        let name = table_name(&request.settings.name)?;
        let mut max_players = usize::from(request.settings.max_players);
        let mut extra = requested_extra(&request.settings)?;
        if session.user == self.table.owner.user_id {
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
        if session.user != self.table.owner.user_id {
            let changes = option_changes(&self.table, &options, &name, max_players, &extra);
            ensure_or_reject!(!changes.is_empty(), "There are no new options proposed.");
            // A proposal is a message from its player, so it counts like one.
            self.admit_player_chat(session.user)?;
            let message = server_chat(
                self.table.id,
                &format!("{} proposes the following options:{changes}", session.name),
            );
            let mut next = self.candidate();
            push_chat(&mut next, [(None, message.clone())])?;
            self.persist(next).await?;
            let mut e = self.effects();
            self.add_chat(&mut e, &message);
            if let Some(owner) = self.attendees.get(&self.table.owner.user_id) {
                let suggestion =
                    options_suggestion(self.table.id, &options, &name, max_players, &extra);
                e.messages.push((
                    owner.session.clone(),
                    frame(
                        hanabi_protocol::event::TABLE_SETTINGS_SUGGESTION,
                        suggestion,
                    ),
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
        if players.iter().all(|p| !p.is(next.owner.user_id)) {
            next.owner = players[0].user_ref()?;
        }
        let message = table_notice(
            &mut next,
            &format!("{} has changed game options.", session.name),
        );
        self.persist(next).await?;
        let mut e = self.effects();
        for p in removed {
            if let Some(a) = p.id.and_then(|id| self.attendees.remove(&id)) {
                e.statuses.push((a.session.clone(), Status::Lobby, None));
                e.messages.push((
                    a.session,
                    frame(
                        hanabi_protocol::event::TABLE_LEFT,
                        TableRef {
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
            self.attending(&session) && session.user == self.table.owner.user_id,
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
                players.iter().all(|p| p
                    .id
                    .and_then(|id| self.attendees.get(&id))
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
                options
                    .time_control
                    .map_or(0, |time| time.base_seconds.get() * MS_PER_SECOND);
                n
            ],
            ..Snapshot::new(
                next.id,
                Some(game_id),
                next.owner.user_id,
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
            a.synced = false;
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
                    hanabi_protocol::event::TABLE_JOINED,
                    TableJoined {
                        table_id: self.table.id,
                        stage: TableStage::JustStarted,
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
            .filter_map(|p| p.id)
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
                    hanabi_protocol::event::TABLE_LEFT,
                    TableRef {
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
            self.attending(&session) && session.user == self.table.owner.user_id,
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
            if sorted[..mid].iter().any(|p| p.is(self.table.owner.user_id)) {
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
        let selected_ids = selected.iter().filter_map(|p| p.id).collect::<HashSet<_>>();
        let allocation = self.allocation().await?;
        ensure_or_reject!(session.active(), "Owner changed while splitting");
        let mut source = self.candidate();
        let Phase::Pregame { players, .. } = &mut source.phase else {
            bail_internal!("A pregame command ran outside a pregame");
        };
        players.retain(|p| !p.id.is_some_and(|id| selected_ids.contains(&id)));
        let new_owner = players
            .first()
            .filter(|_| selected_ids.contains(&source.owner.user_id))
            .cloned();
        let retire = players.is_empty();
        if let Some(owner) = &new_owner {
            source.owner = owner.user_ref()?;
        }
        let names = selected
            .iter()
            .map(|p| p.name.as_str())
            .collect::<Vec<_>>()
            .join(", ");
        let mut notices = vec![];
        if !retire {
            notices.extend(table_notice(
                &mut source,
                &format!("{} split {names} into a new lobby.", session.name),
            ));
            if let Some(owner) = new_owner {
                notices.extend(new_owner_notice(&mut source, &owner.name));
            }
        }
        let mut destination = self.table.clone();
        destination.id = allocation.id;
        destination.name = format!(
            "{}{SPLIT_SUFFIX}",
            crate::accounts::truncate_to_max_chars(
                self.table.name.trim(),
                MAX_TABLE_NAME_LENGTH - SPLIT_SUFFIX.len()
            )
        );
        destination.owner = selected[0].user_ref()?;
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
            &format!("This lobby was created by splitting {}.", self.table.name),
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
