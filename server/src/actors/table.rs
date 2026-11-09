use super::{
    Allocation, Attendance, Command, Effects, GameInfo, HubCommand, NO_SHADOWED_SEAT,
    PREGAME_RECONNECT_GRACE, REPLAY_RECONNECT_GRACE, Reply, TableActor, TableCommand,
    TableInspection, TableView,
    chat::{TABLE_CHAT_LIMIT, TABLE_CHAT_WINDOW, VariantDiscovery, is_variant_discovery},
    pregame::remove_pregame_players,
    setup::wire_table_options,
    wire::int,
};
use crate::errors::OrReject;
use crate::routing::{Route, route};
use crate::store::{Commit, Committed};
use crate::{
    model::{
        CLOCK_UNITS_PER_SECOND, IDLE_TIMEOUT_MS, IDLE_WARNING_MS, Phase, Snapshot, TableChat,
        TableSnapshot, small,
    },
    server_info::ServerInfo,
    store::Store,
    transport::{Outgoing, Session, frame, stored_frame},
};
use anyhow::{Context, Result, ensure};
use chrono::Utc;
use hanabi_engine::{CompletionTiming, EndCondition};
use hanabi_protocol::{
    Chat, ChatTyping, ClientMessage, GameId, IdleWarning, NO_VALUE, Status, TableId, TableRequest,
    TableStarted, UserId, Warning,
};
use serde::Serialize;
use serde_json::json;
use std::{
    collections::{BTreeMap, HashMap, HashSet},
    sync::Arc,
    time::{Duration, Instant},
};
use tokio::sync::{Notify, OwnedSemaphorePermit, mpsc, oneshot};

/// How long a table waits before retrying timed work that failed.
const TIMER_RETRY: Duration = Duration::from_millis(250);

/// The refusal of a command that the table's phase does not accept.
pub(super) fn wrong_phase(message: &ClientMessage) -> anyhow::Error {
    use ClientMessage as M;
    let reason = match message {
        M::TableStart(_) => "Already started",
        M::TableSetVariant(_) | M::TableUpdate(_) => "Game already started",
        M::Action(_)
        | M::Pause(_)
        | M::IdleReset(_)
        | M::Note(_)
        | M::TableTerminate(_)
        | M::TableVoteForTermination(_) => "Not an ongoing game",
        M::ReplayAction(_) => "Not a replay",
        M::TableSuggest(_) | M::TableRestartDecline(_) => "Not a shared replay",
        M::TableRestart(_) => "Only the shared replay leader can restart",
        M::Tag(_) | M::TagDelete(_) | M::TagsDeleteAll(_) => "No game",
        _ => "This table does not accept that command now",
    };
    rejection!("{reason}")
}

/// A running game's timers as they stand now.
struct Timers {
    idle_remaining: i64,
    /// The active player's clock.
    active_clock: i64,
    /// How long the active player has taken this turn.
    turn_elapsed: i64,
    /// Whether the active player's clock is counting down.
    counting: bool,
    timed: bool,
}

impl Timers {
    fn timed_out(&self) -> bool {
        self.timed && self.counting && self.active_clock <= 0
    }
}
/// The time added to each clock of a timed game when a graceful restart drains its table, so that
/// players do not lose time to the restart.
const MAINTENANCE_CLOCK_ALLOWANCE_SECONDS: i64 = 20;

impl TableActor {
    pub(super) fn new(
        table: TableSnapshot,
        revision: i64,
        store: Store,
        hub: mpsc::Sender<HubCommand>,
        permit: OwnedSemaphorePermit,
        info: Arc<ServerInfo>,
    ) -> Self {
        Self {
            table,
            revision,
            frozen: false,
            retired: false,
            attendees: HashMap::new(),
            chat_read: HashMap::new(),
            pregame_absent_until: HashMap::new(),
            replay_absent_until: None,
            cleanup: Arc::new(Notify::new()),
            store,
            hub,
            anchor: Instant::now(),
            idle_warned: false,
            timer_retry: None,
            full_join_notices: HashSet::new(),
            chat_limit: crate::accounts::Counter::new(TABLE_CHAT_LIMIT, TABLE_CHAT_WINDOW),
            _permit: permit,
            info,
        }
    }
    pub(super) fn view(&self) -> TableView {
        let replay = matches!(self.table.phase, Phase::Replay { .. });
        let running = !matches!(self.table.phase, Phase::Pregame { .. });
        let max_progress = i32::from(hanabi_protocol::MAX_PROGRESS);
        let progress = if let Some(s) = self.table.game() {
            if let Phase::Replay { replay, .. } = &self.table.phase {
                (replay.segment * max_progress / s.game.turn.max(1)).clamp(0, max_progress)
            } else {
                s.game.score * max_progress
                    / hanabi_engine::get_variant(&self.table.options.variant_name)
                        .expect("variant")
                        .max_score
            }
        } else {
            0
        };
        let spectators = self.spectators();
        let replay_game = match &self.table.phase {
            Phase::Replay { snapshot, .. } if snapshot.game_id > 0 => Some(snapshot.game_id),
            _ => None,
        };
        TableView {
            players: self.table.players().iter().map(|p| p.id).collect(),
            replay,
            replay_game,
            visible: self.table.visible,
            reconnects: self
                .table
                .shadows
                .iter()
                .filter(|(id, _)| replay || self.table.players().iter().all(|p| p.id != **id))
                .map(|(id, shadow)| (*id, *shadow))
                .collect(),
            inspection: TableInspection {
                running,
                replay,
                frozen: self.frozen,
            },
            data: hanabi_protocol::Table {
                database_id: replay_game.map(GameId),
                id: TableId(self.table.id),
                joined: false,
                max_players: small(self.table.max_players),
                name: self.table.name.clone(),
                num_players: small(self.table.players().len()),
                options: wire_table_options(&self.table.options, &self.table.extra),
                owner_id: UserId(self.table.owner),
                password_protected: self.table.password_hash.is_some(),
                players: self
                    .table
                    .players()
                    .iter()
                    .map(|p| p.name.clone())
                    .collect(),
                progress: u8::try_from(progress.clamp(0, max_progress)).unwrap_or(0),
                running,
                shared_replay: replay && self.table.visible,
                spectators,
                time_base: self.table.options.time_base,
                time_per_turn: self.table.options.time_per_turn,
                timed: self.table.options.timed,
                variant: self.table.options.variant_name.clone(),
            },
        }
    }
    pub(super) fn spectators(&self) -> Vec<hanabi_protocol::Spectator> {
        self.attendees
            .values()
            .filter(|a| a.spectator && a.session.active())
            .map(|a| hanabi_protocol::Spectator {
                name: a.session.name.clone(),
                shadowing_player_index: a
                    .shadow
                    .and_then(|seat| i8::try_from(seat).ok())
                    .unwrap_or(NO_SHADOWED_SEAT),
                shadowing_player_username: a
                    .shadow
                    .and_then(|seat| self.table.players().get(seat))
                    .map(|p| p.name.clone()),
            })
            .collect()
    }
    pub(super) fn spectator_messages(&self, e: &mut Effects) {
        self.add_all(
            e,
            hanabi_protocol::server::SPECTATORS,
            hanabi_protocol::Spectators {
                table_id: TableId(self.table.id),
                spectators: self.spectators(),
            },
        );
    }
    pub(super) fn effects(&self) -> Effects {
        Effects {
            table: self.table.id,
            view: self.view(),
            statuses: vec![],
            messages: vec![],
        }
    }
    pub(super) async fn publish(&self, effects: Effects) -> Result<()> {
        self.store.check_state()?;
        self.hub
            .send(HubCommand::Effects(effects))
            .await
            .context("Coordinator stopped")
    }
    pub(super) fn attending(&self, s: &Session) -> bool {
        s.active()
            && self
                .attendees
                .get(&s.user)
                .is_some_and(|a| a.session.generation == s.generation)
    }
    pub(super) fn seat(&self, s: &Session) -> Result<usize> {
        self.table
            .players()
            .iter()
            .position(|p| p.id == s.user)
            .or_reject("You are not playing at this table")
    }
    pub(super) fn audience(&self) -> impl Iterator<Item = &Attendance> {
        self.attendees.values().filter(|a| a.session.active())
    }
    pub(super) fn add_all<T: Serialize>(
        &self,
        e: &mut Effects,
        message: hanabi_protocol::ServerMessage<T>,
        data: T,
    ) {
        let message = frame(message, data);
        for a in self.audience() {
            e.messages.push((a.session.clone(), message.clone()));
        }
    }
    pub(super) fn add_outgoing(&self, e: &mut Effects, message: &Outgoing) {
        let message = message.frame();
        for a in self.audience() {
            e.messages.push((a.session.clone(), message.clone()));
        }
    }
    pub(super) fn spectating(&self, user: i32) -> bool {
        self.attendees.get(&user).is_some_and(|a| a.spectator)
    }
    pub(super) fn add_chat(&self, e: &mut Effects, chat: &Chat) {
        self.add_all(e, hanabi_protocol::server::CHAT, chat.clone());
    }
    pub(super) fn typing_messages(&self, e: &mut Effects, author: i32, name: &str, typing: bool) {
        let message = frame(
            hanabi_protocol::server::CHAT_TYPING,
            ChatTyping {
                table_id: TableId(self.table.id),
                name: name.into(),
                typing,
            },
        );
        for a in self.audience().filter(|a| a.session.user != author) {
            e.messages.push((a.session.clone(), message.clone()));
        }
    }
    pub(super) fn pregame_messages(&self, e: &mut Effects) {
        for a in self.audience() {
            let players = self
                .table
                .players()
                .iter()
                .enumerate()
                .map(|(index, p)| hanabi_protocol::PregamePlayer {
                    index: small(index),
                    name: p.name.clone(),
                    you: p.id == a.session.user,
                    present: self
                        .attendees
                        .get(&p.id)
                        .is_some_and(|a| a.session.active() && !a.spectator),
                    stats: p.stats.clone(),
                })
                .collect();
            let pregame = hanabi_protocol::Pregame {
                table_id: TableId(self.table.id),
                name: self.table.name.clone(),
                owner: UserId(self.table.owner),
                players,
                options: wire_table_options(&self.table.options, &self.table.extra),
                password_protected: self.table.password_hash.is_some(),
                max_players: small(self.table.max_players),
            };
            e.messages.push((
                a.session.clone(),
                frame(hanabi_protocol::server::GAME, pregame),
            ));
        }
    }
    pub(super) fn chat_history(&self, e: &mut Effects, session: &Arc<Session>) -> Result<()> {
        let read = self.chat_read.get(&session.user).copied().unwrap_or(0);
        e.messages.push((
            session.clone(),
            stored_frame(
                hanabi_protocol::server::CHAT_LIST,
                &json!({
                    "list":self.table.chat.iter().map(TableChat::wire_message).collect::<Result<Vec<_>>>()?,
                    "unread":self.table.chat.len().saturating_sub(read)
                }),
            )?,
        ));
        Ok(())
    }
    /// The milliseconds since the stored timers were last brought up to date.
    fn elapsed_ms(&self) -> i64 {
        i64::try_from(self.anchor.elapsed().as_millis())
            .unwrap_or(i64::MAX)
            .min(hanabi_protocol::MAX_SAFE_INTEGER)
    }
    /// The game's timers as they stand now, read without copying the table.
    fn timers(&self) -> Option<Timers> {
        let s = self.table.game()?;
        let elapsed = self.elapsed_ms();
        let counting = matches!(self.table.phase, Phase::Live { .. })
            && s.game.end_condition == EndCondition::InProgress
            && s.timer_started
            && !s.game.paused;
        let running = if counting { elapsed } else { 0 };
        Some(Timers {
            idle_remaining: (s.idle_remaining - elapsed).max(0),
            active_clock: s.clocks[s.game.active_player_index] - running,
            turn_elapsed: s.turn_elapsed + running,
            counting,
            timed: s.game.options.timed,
        })
    }
    /// When the table next has timed work: an expiring typing indicator or reconnection grace, a
    /// pregame start, an idle warning or ending, or a player running out of time. Once a turn or
    /// an idle reset restarts the idle timer, this also lets the idle warning be sent again.
    pub(super) fn next_timer(&mut self) -> Option<Instant> {
        if self.frozen || self.store.check_state().is_err() {
            return None;
        }
        if self
            .timers()
            .is_some_and(|t| t.idle_remaining > IDLE_WARNING_MS)
        {
            self.idle_warned = false;
        }
        let now = Instant::now();
        let anchor = self.anchor;
        let after = |ms: i64| anchor + Duration::from_millis(u64::try_from(ms).unwrap_or(0));
        let mut deadlines = self
            .attendees
            .values()
            .filter_map(|a| a.typing_until)
            .collect::<Vec<_>>();
        deadlines.extend(self.pregame_absent_until.values().copied());
        deadlines.extend(self.replay_absent_until);
        deadlines.extend(self.timer_retry);
        match &self.table.phase {
            Phase::Pregame {
                players,
                automatic_start,
                countdown,
                ..
            } => {
                // A start waits for the owner, whose return reschedules the timers.
                if self
                    .attendees
                    .get(&self.table.owner)
                    .is_some_and(|a| a.session.active())
                {
                    if automatic_start.is_some_and(|n| n == players.len()) {
                        deadlines.push(now);
                    }
                    if let Some(at) = countdown {
                        deadlines.push(now + (*at - Utc::now()).to_std().unwrap_or_default());
                    }
                }
            }
            Phase::Live { snapshot: s } => {
                if s.game.end_condition == EndCondition::InProgress {
                    deadlines.push(after(s.idle_remaining));
                    if !self.idle_warned {
                        deadlines.push(after(s.idle_remaining - IDLE_WARNING_MS));
                    }
                    if s.game.options.timed && s.timer_started && !s.game.paused {
                        deadlines.push(after(s.clocks[s.game.active_player_index]));
                    }
                }
            }
            Phase::Replay { snapshot: s, .. } => deadlines.push(after(s.idle_remaining)),
        }
        let earliest = deadlines.iter().min().copied()?;
        Some(
            self.timer_retry
                .map_or(earliest, |retry| earliest.max(retry)),
        )
    }
    /// Runs the table's timed work, retrying after `TIMER_RETRY` if it fails.
    async fn run_timers(&mut self) {
        match self.tick().await {
            Ok(()) => self.timer_retry = None,
            Err(error) => {
                eprintln!("Table timer: {error}");
                self.timer_retry = Some(Instant::now() + TIMER_RETRY);
            }
        }
    }
    pub(super) fn candidate(&self) -> TableSnapshot {
        let mut next = self.table.clone();
        let live = matches!(next.phase, Phase::Live { .. });
        let delta = self.elapsed_ms();
        if let Some(s) = next.game_mut() {
            s.idle_remaining = (s.idle_remaining - delta).max(0);
            if live && s.game.end_condition == EndCondition::InProgress {
                s.duration = s.duration.saturating_add(delta);
                if s.timer_started && !s.game.paused {
                    let active = s.game.active_player_index;
                    s.clocks[active] -= delta;
                    s.turn_elapsed += delta;
                }
            }
        }
        next
    }
    /// Keeps a change that is not worth a durable write, such as an idle-timer reset, in memory.
    /// The next checkpoint saves it, including the one written when the server drains; a crash
    /// before then only loses this change.
    pub(super) fn apply_without_checkpoint(&mut self, next: TableSnapshot) -> Result<()> {
        self.store.check_state()?;
        ensure_or_reject!(!self.frozen, "Table is frozen until recovery");
        self.table = next;
        self.anchor = Instant::now();
        Ok(())
    }
    pub(super) async fn persist(&mut self, next: TableSnapshot) -> Result<()> {
        self.persist_with(next, Commit::default()).await.map(|_| ())
    }
    /// Saves a change to the table, with the work that goes with it, in one transaction. A finished
    /// game becomes a replay and is archived in the same commit. When saving fails, the table keeps
    /// its earlier state.
    pub(super) async fn persist_with(
        &mut self,
        mut next: TableSnapshot,
        mut work: Commit<'_>,
    ) -> Result<Committed> {
        self.store.check_state()?;
        ensure_or_reject!(!self.frozen, "Table is frozen until recovery");
        if next.visible
            && next
                .chat
                .iter()
                .skip(self.table.chat.len())
                .any(|chat| chat.user > 0)
            && let Phase::Replay { snapshot, .. } = &mut next.phase
        {
            snapshot.idle_remaining = IDLE_TIMEOUT_MS;
        }
        let old_ids = self
            .table
            .players()
            .iter()
            .map(|p| p.id)
            .collect::<Vec<_>>();
        let new_ids = next.players().iter().map(|p| p.id).collect::<Vec<_>>();
        if old_ids != new_ids {
            for shadow in next.shadows.values_mut() {
                *shadow = shadow
                    .and_then(|seat| usize::try_from(seat).ok())
                    .and_then(|seat| old_ids.get(seat))
                    .and_then(|id| new_ids.iter().position(|new| new == id))
                    .map(hanabi_engine::int);
            }
        }
        if let Some(s) = next.game_mut()
            && s.game.end_condition != EndCondition::InProgress
            && s.finished.is_none()
        {
            s.finished = Some(Utc::now());
        }
        let finished = matches!(&next.phase, Phase::Live { snapshot }
            if snapshot.game.end_condition != EndCondition::InProgress);
        if finished {
            next.convert_to_replay()?;
            for a in self.audience() {
                next.shadows.insert(a.session.user, None);
            }
        }
        work.archive = finished && !next.extra.no_write_to_database;
        let archived = work.archive;
        let committed = self.store.commit(&mut next, self.revision, work).await?;
        if archived && let Some(s) = next.game() {
            self.store.refresh_background(s.clone());
        }
        self.revision = committed.revision;
        let became_replay = matches!(self.table.phase, Phase::Live { .. })
            && matches!(next.phase, Phase::Replay { .. });
        self.table = next;
        for a in self.attendees.values_mut() {
            if became_replay {
                a.spectator = true;
                a.shadow = None;
            }
            if let Some(shadow) = self.table.shadows.get(&a.session.user) {
                a.shadow = shadow.and_then(|s| usize::try_from(s).ok());
            }
        }
        self.anchor = Instant::now();
        Ok(committed)
    }
    pub(super) async fn initialize(
        &mut self,
        s: Arc<Session>,
        warnings: Vec<String>,
    ) -> Result<()> {
        self.pregame_absent_until.remove(&s.user);
        let replay = matches!(self.table.phase, Phase::Replay { .. });
        if replay {
            let mut next = self.candidate();
            next.game_mut().context("Missing replay")?.idle_remaining = IDLE_TIMEOUT_MS;
            next.shadows.insert(s.user, None);
            self.persist(next).await?;
        }
        self.attendees.insert(
            s.user,
            Attendance {
                session: s.clone(),
                loaded: false,
                spectator: replay,
                shadow: None,
                typing_until: None,
            },
        );
        self.replay_absent_until = None;
        let mut e = self.effects();
        if matches!(self.table.phase, Phase::Pregame { .. }) {
            e.statuses
                .push((s.clone(), Status::PreGame, Some(self.table.id)));
            self.pregame_messages(&mut e);
            e.messages.push((
                s.clone(),
                frame(
                    hanabi_protocol::server::JOINED,
                    TableRequest {
                        table_id: TableId(self.table.id),
                    },
                ),
            ));
            self.chat_history(&mut e, &s)?;
        } else {
            e.statuses.push((
                s.clone(),
                if self.table.visible {
                    Status::SharedReplay
                } else {
                    Status::Replay
                },
                Some(self.table.id),
            ));
            e.messages.push((
                s.clone(),
                frame(
                    hanabi_protocol::server::TABLE_START,
                    TableStarted {
                        table_id: TableId(self.table.id),
                        replay: true,
                    },
                ),
            ));
        }
        for warning in warnings {
            e.messages.push((
                s.clone(),
                frame(hanabi_protocol::server::WARNING, Warning { warning }),
            ));
        }
        self.publish(e).await
    }
    pub(super) async fn run(
        mut self,
        mut receiver: mpsc::Receiver<TableCommand>,
        initial: Option<(Arc<Session>, Vec<String>, Reply)>,
    ) {
        let mut pregame_refresh =
            if initial.is_none() && matches!(self.table.phase, Phase::Pregame { .. }) {
                let pool = self.store.lobby_reads.clone();
                let users = self
                    .table
                    .players()
                    .iter()
                    .map(|player| player.id)
                    .collect::<Vec<_>>();
                Some(Box::pin(async move {
                    let counts = crate::database::normal_game_counts(&pool, &users, false).await?;
                    Ok::<_, anyhow::Error>((users, counts))
                }))
            } else {
                None
            };
        if let Some((session, warnings, reply)) = initial {
            let result = self.initialize(session, warnings).await;
            let _ = reply.send(result);
        }
        // Recovered tables start their reconnection grace and catch up on missed deadlines.
        if !self.frozen && self.store.check_state().is_ok() {
            self.run_timers().await;
        }
        let mut discovery: Option<(VariantDiscovery, Reply)> = None;
        loop {
            if self.retired {
                break;
            }
            let discovering = discovery.is_some();
            let timer = self.next_timer();
            tokio::select! {
                result = async { pregame_refresh.as_mut().expect("enabled statistics refresh").await }, if pregame_refresh.is_some() => {
                    pregame_refresh = None;
                    if let Err(error) = self.apply_game_counts(result).await {
                        eprintln!("Deferred pregame statistics failed for table {}: {error:#}", self.table.id);
                    }
                }
                selected = async { discovery.as_mut().expect("enabled discovery").0.query.as_mut().await }, if discovering => {
                    let (query, reply) = discovery.take().expect("completed discovery");
                    let result = self.finish_discovery(query, selected).await;
                    let _ = reply.send(result);
                }
                command = receiver.recv() => match command {
                    None => break,
                    Some(TableCommand::Drain(reply)) => {
                        let _ = reply.send(self.drain().await);
                        break;
                    }
                    Some(TableCommand::Client { session, command, reply }) => {
                        if is_variant_discovery(&command) {
                            if discovering {
                                let _ = reply.send(Err(rejection!("A variant search is already pending at this table.")));
                            } else {
                                match self.prepare_discovery(session) {
                                    Ok(query) => discovery = Some((query, reply)),
                                    Err(error) => {
                                        let _ = reply.send(Err(error));
                                    }
                                }
                            }
                            continue;
                        }
                        let result = if session.active() {
                            self.command(session, command).await
                        } else {
                            Err(rejection!("Stale session or unavailable authority"))
                        };
                        let _ = reply.send(result);
                    }
                },
                () = self.cleanup.notified() => {
                    if let Err(e) = self.cleanup(Instant::now()).await {
                        eprintln!("Table cleanup: {e}");
                    }
                }
                () = async { tokio::time::sleep_until(timer.expect("scheduled timer").into()).await }, if timer.is_some() => {
                    self.run_timers().await;
                }
            }
        }
        if let Some((_, reply)) = discovery.take() {
            let _ = reply.send(Err(rejection!("Table closed during variant discovery")));
        }
        receiver.close();
        while let Some(command) = receiver.recv().await {
            match command {
                TableCommand::Drain(reply) => {
                    let _ = reply.send(if self.retired {
                        Ok(())
                    } else {
                        self.store.check_state()
                    });
                }
                TableCommand::Client { reply, .. } => {
                    let _ = reply.send(Err(rejection!("Table closed")));
                }
            }
        }
    }
    /// Updates the cached game totals of pregame players after a recovery.
    async fn apply_game_counts(
        &mut self,
        result: Result<(Vec<i32>, BTreeMap<i32, i64>)>,
    ) -> Result<()> {
        let (users, counts) = result?;
        let mut next = self.candidate();
        if next.set_game_counts(&users, &counts) {
            self.persist(next).await?;
            let mut effects = self.effects();
            self.pregame_messages(&mut effects);
            self.publish(effects).await?;
        }
        Ok(())
    }
    /// Saves the table for a graceful stop, giving timed games their maintenance allowance once.
    async fn drain(&mut self) -> Result<()> {
        ensure!(!self.frozen, "Cannot drain frozen table");
        let mut next = self.candidate();
        if let Some(s) = next.game_mut()
            && s.game.end_condition == EndCondition::InProgress
            && s.game.options.timed
            && !s.maintenance_applied
        {
            for clock in &mut s.clocks {
                *clock += MAINTENANCE_CLOCK_ALLOWANCE_SECONDS * i64::from(CLOCK_UNITS_PER_SECOND);
            }
            s.maintenance_applied = true;
        }
        self.persist(next).await
    }
    pub(super) async fn cleanup(&mut self, now: Instant) -> Result<()> {
        self.store.check_state()?;
        ensure!(!self.frozen, "Frozen table cannot be cleaned up");
        let before = self.attendees.len();
        let expired = self
            .attendees
            .values()
            .filter(|a| !a.session.active() && a.typing_until.is_some())
            .map(|a| (a.session.user, a.session.name.clone()))
            .collect::<Vec<_>>();
        self.attendees.retain(|_, a| a.session.active());
        if matches!(self.table.phase, Phase::Replay { .. }) && self.attendees.is_empty() {
            let deadline = self
                .replay_absent_until
                .get_or_insert(now + REPLAY_RECONNECT_GRACE);
            if now >= *deadline {
                return self.retire().await;
            }
        } else {
            self.replay_absent_until = None;
        }
        let successor = self.audience().next().map(|a| a.session.user);
        if before != self.attendees.len()
            && matches!(self.table.phase, Phase::Replay { .. })
            && !self.attendees.contains_key(&self.table.owner)
            && let Some(successor) = successor
        {
            let mut next = self.candidate();
            next.owner = successor;
            if let Phase::Replay { replay, .. } = &mut next.phase {
                replay.leader = successor;
            }
            self.persist(next).await?;
        }
        if before != self.attendees.len() {
            let mut e = self.effects();
            for (id, name) in expired {
                self.typing_messages(&mut e, id, &name, false);
            }
            self.add_all(&mut e, hanabi_protocol::server::CONNECTED, self.connected());
            self.spectator_messages(&mut e);
            self.publish(e).await?;
        }
        self.cleanup_pregame(now).await
    }
    pub(super) async fn cleanup_pregame(&mut self, now: Instant) -> Result<()> {
        let Phase::Pregame { players, .. } = &self.table.phase else {
            self.pregame_absent_until.clear();
            return Ok(());
        };
        let absent = players
            .iter()
            .filter(|p| {
                !self
                    .attendees
                    .get(&p.id)
                    .is_some_and(|a| !a.spectator && a.session.active())
            })
            .map(|p| p.id)
            .collect::<HashSet<_>>();
        self.pregame_absent_until
            .retain(|id, _| absent.contains(id));
        for id in absent {
            // Recovered pregames also get a fresh grace period for reconnecting clients.
            self.pregame_absent_until
                .entry(id)
                .or_insert(now + PREGAME_RECONNECT_GRACE);
        }
        let removed = self
            .pregame_absent_until
            .iter()
            .filter(|(_, deadline)| now >= **deadline)
            .map(|(id, _)| *id)
            .collect::<HashSet<_>>();
        if removed.is_empty() {
            return Ok(());
        }
        let mut next = self.candidate();
        let notices = remove_pregame_players(&mut next, &removed);
        if next.players().is_empty() {
            return self.retire().await;
        }
        self.persist(next).await?;
        self.pregame_absent_until
            .retain(|id, _| !removed.contains(id));
        let mut effects = self.effects();
        self.pregame_messages(&mut effects);
        self.spectator_messages(&mut effects);
        for message in notices {
            self.add_chat(&mut effects, &message);
        }
        self.publish(effects).await
    }
    pub(super) fn connected(&self) -> hanabi_protocol::Connected {
        let replay = matches!(self.table.phase, Phase::Replay { .. });
        hanabi_protocol::Connected {
            table_id: TableId(self.table.id),
            list: self
                .table
                .players()
                .iter()
                .map(|p| {
                    replay
                        || self
                            .attendees
                            .get(&p.id)
                            .is_some_and(|a| a.loaded && !a.spectator && a.session.active())
                })
                .collect(),
        }
    }
    pub(super) fn card_identities(&self, s: &Snapshot) -> hanabi_protocol::CardIdentities {
        hanabi_protocol::CardIdentities {
            table_id: TableId(self.table.id),
            card_identities: s
                .game
                .identities()
                .iter()
                .map(|card| hanabi_protocol::CardIdentity {
                    suit_index: int(card.suit_index),
                    rank: i64::from(card.rank),
                })
                .collect(),
        }
    }
    pub(super) fn clock(&self) -> hanabi_protocol::Clock {
        let s = self.table.game().expect("game clock");
        let now = self.timers().expect("game timers");
        let live = matches!(self.table.phase, Phase::Live { .. })
            && s.game.end_condition == EndCondition::InProgress;
        let mut times = s.clocks.clone();
        times[s.game.active_player_index] = now.active_clock;
        hanabi_protocol::Clock {
            table_id: TableId(self.table.id),
            times,
            active_player_index: if live {
                int(s.game.active_player_index)
            } else {
                i64::from(NO_VALUE)
            },
            time_taken: if !live || s.game.paused {
                0
            } else {
                now.turn_elapsed
            },
        }
    }
    pub(super) async fn command(&mut self, session: Arc<Session>, command: Command) -> Result<()> {
        ensure_or_reject!(!self.frozen, "Table is frozen until recovery");
        if matches!(self.table.phase, Phase::Live { .. })
            && self
                .timers()
                .is_some_and(|t| t.idle_remaining == 0 || t.timed_out())
        {
            self.tick().await?;
        }
        let message = match command {
            Command::Client(message) => *message,
            Command::Reattend { spectate, shadow } => {
                return self
                    .reattend(
                        session,
                        spectate,
                        Some(shadow.map_or(i64::from(NO_VALUE), int)),
                    )
                    .await;
            }
        };
        ensure!(
            matches!(route(&message), Route::Table(_)),
            "Unsupported table command: {}",
            message.name()
        );
        match message {
            ClientMessage::TableJoin(r) => self.join(session, r.password).await,
            ClientMessage::TableReattend(_) => self.reattend(session, false, None).await,
            ClientMessage::TableSpectate(r) => {
                self.reattend(session, true, Some(r.shadowing_player_index))
                    .await
            }
            ClientMessage::TableUnattend(_) => self.leave(session, false).await,
            ClientMessage::TableLeave(_) => self.leave(session, true).await,
            ClientMessage::GetGameInfo1(_) => self.info(session, GameInfo::Init).await,
            ClientMessage::GetGameInfo2(_) => self.info(session, GameInfo::State).await,
            ClientMessage::Loaded(_) => {
                ensure_or_reject!(self.attending(&session), "Reattend before loading");
                let mut next = self.candidate();
                let mut starts_clock = false;
                if let Phase::Live { snapshot: s } = &mut next.phase
                    && s.game.end_condition == EndCondition::InProgress
                    && s.players[s.game.active_player_index].id == session.user
                {
                    starts_clock = !s.timer_started || !s.game.started_timer;
                    s.timer_started = true;
                    s.game.start_timer();
                }
                // Loading usually changes nothing durable; only starting the clock needs saving.
                if starts_clock {
                    self.persist(next).await?;
                } else {
                    self.apply_without_checkpoint(next)?;
                }
                if let Some(a) = self.attendees.get_mut(&session.user) {
                    a.loaded = true;
                }
                let mut e = self.effects();
                self.add_all(&mut e, hanabi_protocol::server::CONNECTED, self.connected());
                if matches!(self.table.phase, Phase::Live { .. }) {
                    self.add_all(&mut e, hanabi_protocol::server::CLOCK, self.clock());
                }
                self.publish(e).await
            }
            ClientMessage::Chat(r) => self.chat(session, &r.msg).await,
            ClientMessage::ChatRead(_) => self.chat_presence(session, false).await,
            ClientMessage::ChatTyping(_) => self.chat_presence(session, true).await,
            ClientMessage::TableSetLeader(r) => self.leader(session, &r.name).await,
            // The rest depend on the table's phase.
            message => match self.table.phase {
                Phase::Pregame { .. } => self.pregame_command(session, message).await,
                Phase::Live { .. } => self.live_command(session, message).await,
                Phase::Replay { .. } => self.replay_command(session, message).await,
            },
        }
    }
    pub(super) async fn allocation(&self) -> Result<Allocation> {
        let (reply, received) = oneshot::channel();
        self.hub.send(HubCommand::Allocate(reply)).await?;
        received.await?
    }
    pub(super) async fn tick(&mut self) -> Result<()> {
        self.cleanup(Instant::now()).await?;
        if self.retired {
            return Ok(());
        }
        let mut expired = vec![];
        for a in self.attendees.values_mut() {
            if a.typing_until.is_some_and(|t| Instant::now() >= t) {
                a.typing_until = None;
                expired.push((a.session.user, a.session.name.clone()));
            }
        }
        if !expired.is_empty() {
            let mut e = self.effects();
            for (id, name) in expired {
                self.typing_messages(&mut e, id, &name, false);
            }
            self.publish(e).await?;
        }
        if let Phase::Pregame {
            players,
            automatic_start,
            countdown,
            ..
        } = &self.table.phase
        {
            let due = automatic_start.is_some_and(|n| n == players.len())
                || countdown.is_some_and(|t| Utc::now() >= t);
            if due
                && let Some(owner) = self
                    .attendees
                    .get(&self.table.owner)
                    .filter(|a| a.session.active())
            {
                let owner = owner.session.clone();
                return self.start(owner).await;
            }
            return Ok(());
        }
        let timers = self.timers().expect("game timers");
        if matches!(self.table.phase, Phase::Replay { .. }) {
            if timers.idle_remaining == 0 {
                return self.retire().await;
            }
            return Ok(());
        }
        if self
            .table
            .game()
            .is_some_and(|s| s.game.end_condition != EndCondition::InProgress)
        {
            return Ok(());
        }
        let idle = timers.idle_remaining == 0;
        // Warn the table once before the game ends for inactivity. The warning is sent again after
        // a turn or an idle reset restarts the timer.
        if timers.idle_remaining > IDLE_WARNING_MS {
            self.idle_warned = false;
        } else if !idle && !self.idle_warned {
            self.idle_warned = true;
            let remaining_ms = timers.idle_remaining;
            let mut e = self.effects();
            self.add_all(
                &mut e,
                hanabi_protocol::server::IDLE_WARNING,
                IdleWarning {
                    table_id: TableId(self.table.id),
                    remaining_ms,
                },
            );
            self.publish(e).await?;
        }
        let timeout = timers.timed_out();
        if idle || timeout {
            let mut next = self.candidate();
            let s = next.game_mut().expect("game");
            let active = s.game.active_player_index;
            let from = s.game.events.len();
            if timeout {
                s.clocks[active] = 0;
            }
            s.game.terminate(
                active,
                if idle {
                    EndCondition::IdleTimeout
                } else {
                    EndCondition::Timeout
                },
                if idle {
                    NO_VALUE
                } else {
                    hanabi_engine::int(active)
                },
                None,
                Some(CompletionTiming {
                    player_times: s.clocks.clone(),
                    duration: s.duration,
                }),
            )?;
            self.persist(next).await?;
            self.transitions(from).await?;
        }
        Ok(())
    }
    pub(super) async fn retire(&mut self) -> Result<()> {
        ensure!(!self.frozen, "Frozen table cannot be removed");
        if let Err(e) = self.store.remove(self.table.id, self.revision).await {
            self.frozen = true;
            return Err(e);
        }
        let mut e = self.effects();
        for a in self.audience() {
            e.statuses.push((a.session.clone(), Status::Lobby, None));
            e.messages.push((
                a.session.clone(),
                frame(
                    hanabi_protocol::server::BOOT,
                    TableRequest {
                        table_id: TableId(self.table.id),
                    },
                ),
            ));
        }
        self.publish(e).await?;
        self.hub.send(HubCommand::Retire(self.table.id)).await?;
        self.retired = true;
        Ok(())
    }
}
