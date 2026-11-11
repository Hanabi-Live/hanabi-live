use super::request;
use super::{
    Allocation, Attendance, Blocks, Command, Effects, GameInfo, HubCommand,
    PREGAME_RECONNECT_GRACE, REPLAY_RECONNECT_GRACE, Reply, TableActor, TableCommand, TableView,
    chat::{TABLE_CHAT_LIMIT, TABLE_CHAT_WINDOW, is_variant_discovery},
    pending::{Completed, Pending},
    pregame::remove_pregame_players,
    setup::table_settings,
};
use crate::errors::OrReject;
use crate::errors::{CommandError, CommandResult};
use crate::routing::{Route, route};
use crate::store::{Commit, Outcome, Saved};
use crate::{
    model::{
        CLOCK_UNITS_PER_SECOND, IDLE_TIMEOUT_MS, IDLE_WARNING_MS, Phase, Snapshot, TableChat,
        TableSnapshot,
    },
    server_info::ServerInfo,
    store::Store,
    transport::{Outgoing, Session, frame},
};
use anyhow::{Context, Result};
use chrono::Utc;
use futures_util::{FutureExt, future::BoxFuture};
use hanabi_engine::{CompletionTiming, EndCondition};
use hanabi_protocol::{CardRank, PlayerIndex, SuitIndex};
use hanabi_protocol::{
    Chat, ChatTyping, ClientMessage, IdleWarning, Notice, Status, TableRef, TableStarted, UserId,
};
use serde::Serialize;
use std::{
    collections::{BTreeMap, BTreeSet, HashMap, HashSet},
    sync::Arc,
    time::{Duration, Instant},
};
use tokio::sync::{Notify, OwnedSemaphorePermit, mpsc};

/// How long a table waits before retrying timed work that failed.
const TIMER_RETRY: Duration = Duration::from_millis(250);

/// The refusal of a command that the table's phase does not accept.
pub(super) fn wrong_phase(message: &ClientMessage) -> CommandError {
    use ClientMessage as M;
    let reason = match message {
        M::TableStart(_) => "Already started",
        M::TableSetVariant(_) | M::TableUpdate(_) => "Game already started",
        M::PlayerAction(_)
        | M::Pause(_)
        | M::IdleReset(_)
        | M::Note(_)
        | M::TableTerminate(_)
        | M::TableTerminateVote(_) => "Not an ongoing game",
        M::ReplayAction(_) => "Not a replay",
        M::TableSuggest(_) | M::TableRestartDecline(_) => "Not a shared replay",
        M::TableRestart(_) => "Only the shared replay leader can restart",
        M::Tag(_) | M::TagDelete(_) | M::TagDeleteAll(_) => "No game",
        _ => "This table does not accept that command now",
    };
    rejection!("{reason}")
}

/// The game of a table that is about to change, such as a candidate. A table without a game is
/// an internal error, not a panic, so that a command that runs in the wrong phase fails alone.
pub(super) fn game_mut(table: &mut TableSnapshot) -> CommandResult<&mut Snapshot> {
    match table.game_mut() {
        Some(snapshot) => Ok(snapshot),
        None => bail_internal!("A game command ran at a table without a game"),
    }
}

/// A game's timers at some time after they were last brought up to date.
struct Timers {
    idle_remaining: i64,
    /// The active player's clock.
    active_clock: i64,
    /// How long the active player has taken this turn.
    turn_elapsed: i64,
    duration: i64,
    /// Whether the active player's clock is counting down.
    counting: bool,
    timed: bool,
}

impl Timers {
    /// The timers of game `s` `elapsed` milliseconds after they were last brought up to date.
    /// The idle timer always runs. A `live` game in progress also counts its duration, and its
    /// active player's clock once the clock has started, unless the game is paused.
    fn of(s: &Snapshot, live: bool, elapsed: i64) -> Self {
        let in_progress = live && s.game.end_condition == EndCondition::InProgress;
        let counting = in_progress && s.timer_started && !s.paused();
        let running = if counting { elapsed } else { 0 };
        Self {
            idle_remaining: (s.idle_remaining - elapsed).max(0),
            active_clock: s.clocks[s.game.active_player_index] - running,
            turn_elapsed: s.turn_elapsed + running,
            duration: if in_progress {
                s.duration.saturating_add(elapsed)
            } else {
                s.duration
            },
            counting,
            timed: s.game.options.timed,
        }
    }
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
        saved: Saved,
        store: Store,
        hub: mpsc::Sender<HubCommand>,
        permit: OwnedSemaphorePermit,
        info: Arc<ServerInfo>,
    ) -> Self {
        Self {
            table,
            saved,
            retired: false,
            attendees: HashMap::new(),
            chat_read: HashMap::new(),
            cleanup: Arc::new(Notify::new()),
            store,
            hub,
            anchor: Instant::now(),
            timer_retry: None,
            chat_limit: crate::accounts::Counter::new(TABLE_CHAT_LIMIT, TABLE_CHAT_WINDOW),
            chat_bytes: super::chat::ChatBytes::default(),
            discovering: false,
            _permit: permit,
            info,
        }
    }
    pub(super) fn view(&self) -> TableView {
        let replay = matches!(self.table.phase, Phase::Replay { .. });
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
            Phase::Replay { snapshot, .. } => snapshot.game_id,
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
            data: hanabi_protocol::Table {
                game_id: replay_game,
                table_id: self.table.id,
                joined: false,
                settings: self.settings(),
                owner_id: self.table.owner,
                password_protected: self.table.password_hash.is_some(),
                player_names: self
                    .table
                    .players()
                    .iter()
                    .map(|p| p.name.clone())
                    .collect(),
                progress: u8::try_from(progress.clamp(0, max_progress)).unwrap_or(0),
                phase: match self.table.phase {
                    Phase::Pregame { .. } => hanabi_protocol::TablePhase::Pregame,
                    Phase::Replay { .. } if self.table.visible => {
                        hanabi_protocol::TablePhase::SharedReplay
                    }
                    Phase::Replay { .. } => hanabi_protocol::TablePhase::Replay,
                    Phase::Live { .. } => hanabi_protocol::TablePhase::Playing,
                },
                spectators,
            },
        }
    }
    pub(super) fn spectators(&self) -> Vec<hanabi_protocol::Spectator> {
        self.attendees
            .values()
            .filter(|a| a.spectator && a.session.active())
            .map(|a| hanabi_protocol::Spectator {
                username: a.session.name.clone(),
                shadowing_player_index: a.shadow,
            })
            .collect()
    }
    pub(super) fn spectator_messages(&self, e: &mut Effects) {
        self.add_all(
            e,
            hanabi_protocol::server::SPECTATORS,
            hanabi_protocol::Spectators {
                table_id: self.table.id,
                spectators: self.spectators(),
            },
        );
    }
    pub(super) fn effects(&self) -> Effects {
        Effects {
            table: self.table.id,
            view: self.view(),
            attendees: BTreeSet::new(),
            statuses: vec![],
            messages: vec![],
        }
    }
    pub(super) async fn publish(&self, mut effects: Effects) -> CommandResult<()> {
        self.store.check_state()?;
        effects.attendees = self.attendees.keys().copied().collect();
        Ok(self
            .hub
            .send(HubCommand::Effects(effects))
            .await
            .context("Coordinator stopped")?)
    }
    pub(super) fn attending(&self, s: &Session) -> bool {
        s.active()
            && self
                .attendees
                .get(&s.user)
                .is_some_and(|a| a.session.generation == s.generation)
    }
    pub(super) fn seat(&self, s: &Session) -> CommandResult<usize> {
        self.table
            .players()
            .iter()
            .position(|p| p.id == s.user)
            .or_reject("You are not playing at this table")
    }
    /// Whether the user in `s` played the game at this table and can play it again with a restart.
    /// A replay of a saved or imported game has placeholder players, so it matches nobody.
    pub(super) fn can_play_again(&self, s: &Session) -> bool {
        self.table.extra.replay.is_none() && self.seat(s).is_ok()
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
        for a in self.audience() {
            e.messages
                .push((a.session.clone(), message.frame().clone()));
        }
    }
    pub(super) fn spectating(&self, user: UserId) -> bool {
        self.attendees.get(&user).is_some_and(|a| a.spectator)
    }
    pub(super) fn add_chat(&self, e: &mut Effects, chat: &Chat) {
        self.add_all(e, hanabi_protocol::server::CHAT, chat.clone());
    }
    pub(super) fn typing_messages(
        &self,
        e: &mut Effects,
        author: UserId,
        name: &str,
        typing: bool,
    ) {
        let message = frame(
            hanabi_protocol::server::CHAT_TYPING,
            ChatTyping {
                table_id: self.table.id,
                username: name.into(),
                typing,
            },
        );
        for a in self.audience().filter(|a| a.session.user != author) {
            e.messages.push((a.session.clone(), message.clone()));
        }
    }
    /// The table's settings, as the lobby and its players see them.
    fn settings(&self) -> hanabi_protocol::TableSettings {
        table_settings(
            &self.table.name,
            self.table.max_players,
            &self.table.options,
            &self.table.extra,
        )
    }
    pub(super) fn pregame_messages(&self, e: &mut Effects) {
        for a in self.audience() {
            let players = self
                .table
                .players()
                .iter()
                .enumerate()
                .filter_map(|(seat, p)| Some((PlayerIndex::new(seat)?, p)))
                .map(|(seat, p)| hanabi_protocol::PregamePlayer {
                    index: seat,
                    username: p.name.clone(),
                    you: p.id == a.session.user,
                    present: self
                        .attendees
                        .get(&p.id)
                        .is_some_and(|a| a.session.active() && !a.spectator),
                    stats: p.stats.clone(),
                })
                .collect();
            let pregame = hanabi_protocol::Pregame {
                table_id: self.table.id,
                settings: self.settings(),
                owner_id: self.table.owner,
                players,
                password_protected: self.table.password_hash.is_some(),
            };
            e.messages.push((
                a.session.clone(),
                frame(hanabi_protocol::server::PREGAME, pregame),
            ));
        }
    }
    pub(super) fn chat_history(
        &self,
        e: &mut Effects,
        session: &Arc<Session>,
    ) -> CommandResult<()> {
        let read = self.chat_read.get(&session.user).copied().unwrap_or(0);
        e.messages.push((
            session.clone(),
            frame(
                hanabi_protocol::server::CHAT_LIST,
                hanabi_protocol::ChatList {
                    messages: self
                        .table
                        .chat
                        .iter()
                        .map(TableChat::wire_message)
                        .collect::<Result<_>>()?,
                    unread: i64::try_from(self.table.chat.len().saturating_sub(read))?,
                },
            ),
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
        let live = matches!(self.table.phase, Phase::Live { .. });
        Some(Timers::of(self.table.game()?, live, self.elapsed_ms()))
    }
    /// When the table next has timed work: an expiring typing indicator or reconnection grace, an
    /// idle warning or ending, or a player running out of time.
    pub(super) fn next_timer(&self) -> Option<Instant> {
        if self.store.check_state().is_err() {
            return None;
        }
        let anchor = self.anchor;
        let after = |ms: i64| anchor + Duration::from_millis(u64::try_from(ms).unwrap_or(0));
        let mut deadlines = self
            .attendees
            .values()
            .filter_map(|a| a.typing_until)
            .collect::<Vec<_>>();
        match &self.table.phase {
            Phase::Pregame { runtime, .. } => {
                deadlines.extend(runtime.absent_until.values().copied());
            }
            Phase::Replay { runtime, .. } => deadlines.extend(runtime.absent_until),
            Phase::Live { .. } => {}
        }
        deadlines.extend(self.timer_retry);
        match &self.table.phase {
            Phase::Pregame { .. } => {}
            Phase::Live { snapshot: s, .. } => {
                if s.game.end_condition == EndCondition::InProgress {
                    deadlines.push(after(s.idle_remaining));
                    if !matches!(&self.table.phase, Phase::Live { runtime, .. } if runtime.idle_warned)
                    {
                        deadlines.push(after(s.idle_remaining - IDLE_WARNING_MS));
                    }
                    if s.game.options.timed && s.timer_started && !s.paused() {
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
                tracing::error!("Table timer: {error}");
                self.timer_retry = Some(Instant::now() + TIMER_RETRY);
            }
        }
    }
    /// When each absent pregame player loses their seat. `None` outside a pregame.
    pub(super) fn absent_players(&mut self) -> Option<&mut HashMap<UserId, Instant>> {
        match &mut self.table.phase {
            Phase::Pregame { runtime, .. } => Some(&mut runtime.absent_until),
            _ => None,
        }
    }
    /// When an empty replay closes. `None` outside a replay.
    pub(super) fn replay_absent(&mut self) -> Option<&mut Option<Instant>> {
        match &mut self.table.phase {
            Phase::Replay { runtime, .. } => Some(&mut runtime.absent_until),
            _ => None,
        }
    }
    /// Whether a game was warned that it is about to end for inactivity. `None` outside a game.
    pub(super) fn idle_warned(&mut self) -> Option<&mut bool> {
        match &mut self.table.phase {
            Phase::Live { runtime, .. } => Some(&mut runtime.idle_warned),
            _ => None,
        }
    }
    /// Who a pregame was told tried to join it while it was full. `None` outside a pregame.
    pub(super) fn full_join_notices(&mut self) -> Option<&mut HashSet<UserId>> {
        match &mut self.table.phase {
            Phase::Pregame { runtime, .. } => Some(&mut runtime.full_join_notices),
            _ => None,
        }
    }
    /// When a player last joined a pregame. `None` outside a pregame.
    pub(super) fn last_join(&mut self) -> Option<&mut Option<Instant>> {
        match &mut self.table.phase {
            Phase::Pregame { runtime, .. } => Some(&mut runtime.last_join),
            _ => None,
        }
    }
    pub(super) fn candidate(&self) -> TableSnapshot {
        let mut next = self.table.clone();
        let live = matches!(next.phase, Phase::Live { .. });
        let elapsed = self.elapsed_ms();
        if let Some(s) = next.game_mut() {
            let timers = Timers::of(s, live, elapsed);
            s.idle_remaining = timers.idle_remaining;
            s.clocks[s.game.active_player_index] = timers.active_clock;
            s.turn_elapsed = timers.turn_elapsed;
            s.duration = timers.duration;
        }
        next
    }
    /// Makes `next` the table's state, with its timers up to date as of now. A turn or an idle
    /// reset that restarts the idle timer lets the idle warning be sent again.
    fn install(&mut self, next: TableSnapshot) {
        self.table = next;
        self.anchor = Instant::now();
        if self
            .table
            .game()
            .is_some_and(|s| s.idle_remaining > IDLE_WARNING_MS)
            && let Some(warned) = self.idle_warned()
        {
            *warned = false;
        }
    }
    /// Keeps a change that is not worth a durable write, such as an idle-timer reset, in memory.
    /// The next checkpoint saves it, including the one written when the server drains; a crash
    /// before then only loses this change.
    pub(super) fn apply_without_checkpoint(&mut self, next: TableSnapshot) -> CommandResult<()> {
        self.store.check_state()?;
        self.install(next);
        Ok(())
    }
    pub(super) async fn persist(&mut self, next: TableSnapshot) -> CommandResult<()> {
        self.persist_with(next, Commit::default()).await.map(|_| ())
    }
    /// Saves a turn of a live game and sends its events. Events from position `from` on are new.
    pub(super) async fn persist_turn(
        &mut self,
        next: TableSnapshot,
        from: usize,
    ) -> CommandResult<()> {
        let outcome = self.persist_with(next, Commit::default()).await?;
        self.transitions(from, outcome.seed_games.unwrap_or(0))
            .await
    }
    /// Saves a change to the table, with the work that goes with it, in one transaction. A finished
    /// game becomes a replay and is archived in the same commit. When saving fails, the table keeps
    /// its earlier state.
    pub(super) async fn persist_with(
        &mut self,
        mut next: TableSnapshot,
        mut work: Commit<'_>,
    ) -> CommandResult<Outcome> {
        self.store.check_state()?;
        let finished = next.settle(
            &self.table,
            self.audience().map(|a| a.session.user),
            Utc::now(),
        )?;
        work.archive = finished && !next.extra.no_write_to_database;
        work.count_seed = finished && next.game().is_some_and(|s| s.game_id.is_some());
        let archived = work.archive;
        let outcome = self.store.commit(&mut next, &mut self.saved, work).await?;
        if archived && let Some(s) = next.game() {
            self.store.refresh_background(s.clone());
        }
        let became_replay = matches!(self.table.phase, Phase::Live { .. })
            && matches!(next.phase, Phase::Replay { .. });
        self.install(next);
        for a in self.attendees.values_mut() {
            if became_replay {
                a.spectator = true;
                a.shadow = None;
            }
            if let Some(shadow) = self.table.shadows.get(&a.session.user) {
                a.shadow = *shadow;
            }
        }
        Ok(outcome)
    }
    pub(super) async fn initialize(
        &mut self,
        s: Arc<Session>,
        warnings: Vec<String>,
    ) -> CommandResult<()> {
        if let Some(absent) = self.absent_players() {
            absent.remove(&s.user);
        }
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
        if let Some(absent) = self.replay_absent() {
            *absent = None;
        }
        let mut e = self.effects();
        if matches!(self.table.phase, Phase::Pregame { .. }) {
            e.statuses
                .push((s.clone(), Status::Pregame, Some(self.table.id)));
            self.pregame_messages(&mut e);
            e.messages.push((
                s.clone(),
                frame(
                    hanabi_protocol::server::JOINED,
                    TableRef {
                        table_id: self.table.id,
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
                    hanabi_protocol::server::TABLE_STARTED,
                    TableStarted {
                        table_id: self.table.id,
                        stage: hanabi_protocol::GameStage::Replay,
                    },
                ),
            ));
        }
        for warning in warnings {
            e.messages.push((
                s.clone(),
                frame(hanabi_protocol::server::WARNING, Notice::new(warning)),
            ));
        }
        self.publish(e).await
    }
    pub(super) async fn run(
        mut self,
        mut receiver: mpsc::Receiver<TableCommand>,
        initial: Option<(Arc<Session>, Vec<String>, Reply)>,
    ) {
        let mut pending = Pending::default();
        if initial.is_none() && matches!(self.table.phase, Phase::Pregame { .. }) {
            let pool = self.store.lobby_reads.clone();
            let users = self
                .table
                .players()
                .iter()
                .map(|player| player.id)
                .collect::<Vec<_>>();
            pending.start(
                async move {
                    Completed::GameCounts(
                        crate::database::normal_game_counts(&pool, &users, false)
                            .await
                            .map(|counts| (users, counts)),
                    )
                },
                None,
            );
        }
        if let Some((session, warnings, reply)) = initial {
            let result = self.initialize(session, warnings).await;
            let _ = reply.send(result);
        }
        // Recovered tables start their reconnection grace and catch up on missed deadlines.
        if self.store.check_state().is_ok() {
            self.run_timers().await;
        }
        loop {
            if self.retired {
                break;
            }
            let timer = self.next_timer();
            tokio::select! {
                (completed, reply) = pending.next() => {
                    let result = self.complete(completed).await;
                    match reply {
                        Some(reply) => {
                            let _ = reply.send(result);
                        }
                        None => {
                            if let Err(error) = result {
                                tracing::warn!("Table {} background work failed: {error}", self.table.id);
                            }
                        }
                    }
                }
                command = receiver.recv() => match command {
                    None => break,
                    Some(TableCommand::Drain(reply)) => {
                        let _ = reply.send(self.drain().await.map_err(anyhow::Error::from));
                        break;
                    }
                    Some(TableCommand::Client { session, blocks, command, reply }) => {
                        match self.client(session, &blocks, command).await {
                            Ok(Some(work)) => pending.start(work, Some(reply)),
                            result => {
                                let _ = reply.send(result.map(|_| ()));
                            }
                        }
                    }
                },
                () = self.cleanup.notified() => {
                    if let Err(e) = self.cleanup(Instant::now()).await {
                        tracing::error!("Table cleanup: {e}");
                    }
                }
                () = async { tokio::time::sleep_until(timer.expect("scheduled timer").into()).await }, if timer.is_some() => {
                    self.run_timers().await;
                }
            }
        }
        pending.close();
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
    /// Applies work that finished outside the table's loop.
    async fn complete(&mut self, completed: Completed) -> CommandResult<()> {
        match completed {
            Completed::GameCounts(result) => self.apply_game_counts(result).await,
            Completed::Discovery {
                discovery,
                selected,
            } => {
                self.discovering = false;
                self.finish_discovery(discovery, selected).await
            }
            Completed::Password {
                session,
                blocks,
                hash,
                valid,
            } => {
                self.finish_password_check(session, &blocks, hash, valid)
                    .await
            }
            Completed::Restart {
                session,
                hide,
                stats,
            } => self.finish_restart(session, hide, stats).await,
        }
    }
    /// Updates the cached game totals of pregame players after a recovery.
    async fn apply_game_counts(
        &mut self,
        result: Result<(Vec<UserId>, BTreeMap<UserId, i64>)>,
    ) -> CommandResult<()> {
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
    async fn drain(&mut self) -> CommandResult<()> {
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
    pub(super) async fn cleanup(&mut self, now: Instant) -> CommandResult<()> {
        self.store.check_state()?;
        let before = self.attendees.len();
        let expired = self
            .attendees
            .values()
            .filter(|a| !a.session.active() && a.typing_until.is_some())
            .map(|a| (a.session.user, a.session.name.clone()))
            .collect::<Vec<_>>();
        self.attendees.retain(|_, a| a.session.active());
        let empty = self.attendees.is_empty();
        if let Some(absent) = self.replay_absent() {
            if empty {
                if now >= *absent.get_or_insert(now + REPLAY_RECONNECT_GRACE) {
                    return self.retire().await;
                }
            } else {
                *absent = None;
            }
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
    pub(super) async fn cleanup_pregame(&mut self, now: Instant) -> CommandResult<()> {
        let Phase::Pregame { players, .. } = &self.table.phase else {
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
        let Some(absent_until) = self.absent_players() else {
            return Ok(());
        };
        absent_until.retain(|id, _| absent.contains(id));
        for id in absent {
            // Recovered pregames also get a fresh grace period for reconnecting clients.
            absent_until
                .entry(id)
                .or_insert(now + PREGAME_RECONNECT_GRACE);
        }
        let removed = absent_until
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
        if let Some(absent) = self.absent_players() {
            absent.retain(|id, _| !removed.contains(id));
        }
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
            table_id: self.table.id,
            connected: self
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
            table_id: self.table.id,
            identities: s
                .game
                .identities()
                .iter()
                .map(|card| hanabi_protocol::CardIdentity {
                    suit_index: SuitIndex::new(card.suit_index),
                    rank: CardRank::new(card.rank),
                })
                .collect(),
        }
    }
    pub(super) fn clock(&self) -> CommandResult<hanabi_protocol::Clock> {
        let s = self
            .table
            .game()
            .context("A clock was read without a game")?;
        let now = self.timers().context("A clock was read without a game")?;
        let live = matches!(self.table.phase, Phase::Live { .. })
            && s.game.end_condition == EndCondition::InProgress;
        let mut times = s.clocks.clone();
        times[s.game.active_player_index] = now.active_clock;
        Ok(hanabi_protocol::Clock {
            table_id: self.table.id,
            player_times_ms: times,
            current_player_index: live
                .then(|| PlayerIndex::new(s.game.active_player_index))
                .flatten(),
            time_taken_ms: if !live || s.paused() {
                0
            } else {
                now.turn_elapsed
            },
        })
    }
    /// Runs a client command. A command that waits for slow work, such as a database read or a
    /// password check, only starts here: it returns the work, which the table runs while it answers
    /// other commands, and `complete` finishes the command.
    async fn client(
        &mut self,
        session: Arc<Session>,
        blocks: &Blocks,
        command: Command,
    ) -> CommandResult<Option<BoxFuture<'static, Completed>>> {
        ensure_or_reject!(session.active(), "Stale session or unavailable authority");
        // A game that ran out of time ends before the command runs, so the command sees the end.
        if matches!(self.table.phase, Phase::Live { .. })
            && self
                .timers()
                .is_some_and(|t| t.idle_remaining == 0 || t.timed_out())
        {
            self.tick().await?;
        }
        if let Command::Client(message) = &command {
            let work = match &**message {
                ClientMessage::Chat(r) if is_variant_discovery(&r.text) => {
                    Some(self.start_discovery(session.clone()).map(FutureExt::boxed))
                }
                ClientMessage::TableJoin(r) => self
                    .start_password_check(&session, blocks, r)
                    .map(|work| Ok(work.boxed())),
                ClientMessage::TableRestart(r) => self
                    .start_restart(&session, r.hide_pregame)
                    .map(|work| work.map(FutureExt::boxed)),
                _ => None,
            };
            if let Some(work) = work {
                return work.map(Some);
            }
        }
        self.command(session, blocks, command).await.map(|()| None)
    }
    async fn command(
        &mut self,
        session: Arc<Session>,
        blocks: &BTreeSet<UserId>,
        command: Command,
    ) -> CommandResult<()> {
        let message = match command {
            Command::Client(message) => *message,
            Command::Reattend { spectate, shadow } => {
                return self.reattend(session, blocks, spectate, shadow).await;
            }
        };
        ensure_internal!(
            matches!(route(&message), Route::Table(_) | Route::TableChat(_)),
            "Unsupported table command: {}",
            message.name()
        );
        match message {
            // A join to a table with a password starts its password check in `client` instead.
            ClientMessage::TableJoin(_) => self.join(session, blocks, None).await,
            ClientMessage::TableReattend(_) => self.reattend(session, blocks, false, None).await,
            ClientMessage::TableSpectate(r) => {
                self.reattend(
                    session,
                    blocks,
                    true,
                    r.shadowing_player_index
                        .and_then(|seat| PlayerIndex::new(usize::from(seat))),
                )
                .await
            }
            ClientMessage::TableUnattend(_) => self.leave(session, false).await,
            ClientMessage::TableLeave(_) => self.leave(session, true).await,
            ClientMessage::GameInitLoad(_) => self.info(session, GameInfo::Init).await,
            ClientMessage::GameStateLoad(_) => self.info(session, GameInfo::State).await,
            ClientMessage::Loaded(_) => {
                ensure_or_reject!(self.attending(&session), "Reattend before loading");
                let mut next = self.candidate();
                let mut starts_clock = false;
                if let Phase::Live { snapshot: s, .. } = &mut next.phase
                    && s.game.end_condition == EndCondition::InProgress
                    && s.players[s.game.active_player_index].id == session.user
                {
                    starts_clock = !s.timer_started;
                    s.timer_started = true;
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
                    self.add_all(&mut e, hanabi_protocol::server::CLOCK, self.clock()?);
                }
                self.publish(e).await
            }
            ClientMessage::Chat(r) => self.chat(session, &r.text).await,
            ClientMessage::ChatRead(_) => self.chat_presence(session, false).await,
            ClientMessage::ChatTyping(_) => self.chat_presence(session, true).await,
            ClientMessage::TableSetLeader(r) => self.leader(session, &r.username).await,
            // The rest depend on the table's phase.
            message => match self.table.phase {
                Phase::Pregame { .. } => self.pregame_command(session, message).await,
                Phase::Live { .. } => self.live_command(session, message).await,
                Phase::Replay { .. } => self.replay_command(session, message).await,
            },
        }
    }
    pub(super) async fn allocation(&self) -> CommandResult<Allocation> {
        request(&self.hub, HubCommand::Allocate).await?
    }
    pub(super) async fn tick(&mut self) -> CommandResult<()> {
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
        if matches!(self.table.phase, Phase::Pregame { .. }) {
            return Ok(());
        }
        let timers = self
            .timers()
            .context("A game's timers were read without a game")?;
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
        // Warn the table once before the game ends for inactivity. `install` lets the warning be
        // sent again after a turn or an idle reset restarts the timer.
        if timers.idle_remaining <= IDLE_WARNING_MS
            && !idle
            // Marks the table warned, and goes on only if it was not before.
            && self
                .idle_warned()
                .is_some_and(|warned| !std::mem::replace(warned, true))
        {
            let remaining_ms = timers.idle_remaining;
            let mut e = self.effects();
            self.add_all(
                &mut e,
                hanabi_protocol::server::IDLE_WARNING,
                IdleWarning {
                    table_id: self.table.id,
                    remaining_ms,
                },
            );
            self.publish(e).await?;
        }
        let timeout = timers.timed_out();
        if idle || timeout {
            let mut next = self.candidate();
            let s = game_mut(&mut next)?;
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
                (!idle).then_some(active),
                None,
                Some(CompletionTiming {
                    player_times: s.clocks.clone(),
                    duration: s.duration,
                }),
            )?;
            self.persist_turn(next, from).await?;
        }
        Ok(())
    }
    /// Removes the table. If the removal fails, the table stays as it was, and the timed work
    /// that asked for it tries again.
    pub(super) async fn retire(&mut self) -> CommandResult<()> {
        self.store
            .remove(self.table.id, self.saved.revision)
            .await?;
        let mut e = self.effects();
        for a in self.audience() {
            e.statuses.push((a.session.clone(), Status::Lobby, None));
            e.messages.push((
                a.session.clone(),
                frame(
                    hanabi_protocol::server::BOOT,
                    TableRef {
                        table_id: self.table.id,
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
