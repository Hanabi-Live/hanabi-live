use crate::{
    game::{self, Action, Card, Game},
    model::{FORMAT, Player, Snapshot},
    random::{GoRandom, seed_hash},
    store::Store,
    transport::{Session, frame},
};
use anyhow::{Context, Result, bail, ensure};
use chrono::Utc;
use rand::Rng;
use serde_json::{Value, json};
use std::{collections::HashMap, sync::Arc};
use tokio::sync::{Notify, OwnedSemaphorePermit, Semaphore, mpsc, oneshot};
use tokio_util::task::TaskTracker;

type Reply = oneshot::Sender<Result<()>>;

pub struct Allocation {
    pub id: u64,
    permit: OwnedSemaphorePermit,
}

#[derive(PartialEq)]
pub struct TableView {
    players: Vec<i32>,
    replay: bool,
    visible: bool,
    data: Value,
}
#[derive(Clone)]
pub struct TableHandle {
    pub sender: mpsc::Sender<TableCommand>,
    pub cleanup: Arc<Notify>,
}
struct Entry {
    handle: TableHandle,
    view: Option<TableView>,
}
struct Presence {
    session: Arc<Session>,
    status: u8,
    table: Option<u64>,
}
pub struct Effects {
    pub table: u64,
    pub view: TableView,
    pub statuses: Vec<(Arc<Session>, u8, Option<u64>)>,
    pub messages: Vec<(Arc<Session>, String)>,
}
pub enum HubCommand {
    Register {
        session: Arc<Session>,
        welcome: Value,
        initial: Vec<String>,
        reply: Reply,
    },
    Logout(Arc<Session>),
    Create {
        session: Arc<Session>,
        player: Player,
        name: String,
        deck: Option<Vec<Card>>,
        reply: Reply,
    },
    Allocate(oneshot::Sender<Result<Allocation>>),
    Replay {
        session: Arc<Session>,
        snapshot: Box<Snapshot>,
        allocation: Allocation,
        reply: Reply,
    },
    Route {
        session: Arc<Session>,
        table: u64,
        command: Command,
        reply: Reply,
    },
    Name {
        session: Arc<Session>,
        reply: Reply,
    },
    Effects(Effects),
    Retire(u64),
    Quiesce(oneshot::Sender<Vec<TableHandle>>),
    Stop(oneshot::Sender<()>),
}
pub enum Command {
    Join(Player),
    Start(Option<String>),
    Loaded(Option<String>),
    Action(Action, Option<String>),
    Info(u8),
    Reattend,
    Unattend,
}
pub enum TableCommand {
    Client {
        session: Arc<Session>,
        command: Command,
        reply: Reply,
    },
    Drain(oneshot::Sender<Result<()>>),
}

pub struct Hub {
    receiver: mpsc::Receiver<HubCommand>,
    sender: mpsc::Sender<HubCommand>,
    sessions: HashMap<i32, Presence>,
    tables: HashMap<u64, Entry>,
    next: u64,
    closing: bool,
    store: Store,
    words: Arc<Vec<String>>,
    tasks: TaskTracker,
    capacity: Arc<Semaphore>,
}

impl Hub {
    pub async fn start(
        store: Store,
        words: Arc<Vec<String>>,
        tasks: TaskTracker,
    ) -> Result<mpsc::Sender<HubCommand>> {
        let restored = store.load().await?;
        let (sender, receiver) = mpsc::channel(512);
        let mut hub = Self {
            receiver,
            sender: sender.clone(),
            sessions: HashMap::new(),
            tables: HashMap::new(),
            next: 1,
            closing: false,
            store,
            words,
            tasks,
            capacity: Arc::new(Semaphore::new(256)),
        };
        for (snapshot, revision) in restored {
            hub.next = hub.next.max(snapshot.table_id + 1);
            let id = snapshot.table_id;
            let permit = hub
                .capacity
                .clone()
                .try_acquire_owned()
                .context("Too many recovery tables")?;
            let actor = TableActor::live(
                snapshot,
                revision,
                hub.store.clone(),
                sender.clone(),
                permit,
            );
            let view = actor.view();
            let handle = hub.spawn(actor, None);
            hub.tables.insert(
                id,
                Entry {
                    handle,
                    view: Some(view),
                },
            );
        }
        tokio::spawn(hub.run());
        Ok(sender)
    }

    fn spawn(&self, actor: TableActor, initial: Option<(Arc<Session>, Reply)>) -> TableHandle {
        let (sender, receiver) = mpsc::channel(64);
        let handle = TableHandle {
            sender,
            cleanup: actor.cleanup.clone(),
        };
        self.tasks.spawn(async move {
            actor.run(receiver, initial).await;
        });
        handle
    }

    fn current(&self, session: &Session) -> bool {
        session.active()
            && self
                .sessions
                .get(&session.user)
                .is_some_and(|p| p.session.generation == session.generation)
    }

    fn allocate(&mut self) -> Result<Allocation> {
        ensure!(
            self.next < 9_007_199_254_740_991,
            "Table capacity exhausted"
        );
        let permit = self
            .capacity
            .clone()
            .try_acquire_owned()
            .context("Table capacity exhausted")?;
        let id = self.next;
        self.next += 1;
        Ok(Allocation { id, permit })
    }

    fn user(p: &Presence) -> Value {
        let mut value = json!({"userID":p.session.user,"name":p.session.name,"status":p.status,"hyphenated":p.session.hyphenated,"inactive":false});
        if let Some(table) = p.table {
            value["tableID"] = json!(table);
        }
        value
    }

    fn broadcast(&self, message: &str) {
        for presence in self.sessions.values() {
            presence.session.emit(message);
        }
    }

    fn table_for(view: &TableView, user: i32) -> Value {
        let mut data = view.data.clone();
        data["joined"] = json!(view.players.contains(&user));
        data
    }

    async fn run(mut self) {
        while let Some(command) = self.receiver.recv().await {
            match command {
                HubCommand::Register {
                    session,
                    mut welcome,
                    initial,
                    reply,
                } => {
                    if self.closing
                        || !session.active()
                        || self
                            .sessions
                            .get(&session.user)
                            .is_some_and(|old| old.session.generation > session.generation)
                    {
                        session.cancel.cancel();
                        let _ = reply.send(Err(anyhow::anyhow!("Stale or draining session")));
                        continue;
                    }
                    if let Some(old) = self.sessions.remove(&session.user) {
                        old.session.cancel.cancel();
                    }
                    for entry in self.tables.values() {
                        entry.handle.cleanup.notify_one();
                    }
                    let playing: Vec<_> = self
                        .tables
                        .iter()
                        .filter(|(_, entry)| {
                            entry
                                .view
                                .as_ref()
                                .is_some_and(|v| !v.replay && v.players.contains(&session.user))
                        })
                        .map(|(id, _)| *id)
                        .collect();
                    welcome["playingAtTables"] = json!(playing);
                    welcome["randomTableName"] = json!(random_name(&self.words));
                    self.sessions.insert(
                        session.user,
                        Presence {
                            session: session.clone(),
                            status: 0,
                            table: None,
                        },
                    );
                    session.emit(&frame("welcome", welcome));
                    session.emit(&frame(
                        "userList",
                        json!(self.sessions.values().map(Self::user).collect::<Vec<_>>()),
                    ));
                    session.emit(&frame(
                        "tableList",
                        json!(
                            self.tables
                                .values()
                                .filter_map(|entry| entry.view.as_ref())
                                .filter(|v| v.visible)
                                .map(|view| Self::table_for(view, session.user))
                                .collect::<Vec<_>>()
                        ),
                    ));
                    for message in initial {
                        session.emit(&message);
                    }
                    if let Some(presence) = self.sessions.get(&session.user) {
                        self.broadcast(&frame("user", Self::user(presence)));
                    }
                    let _ = reply.send(Ok(()));
                }
                HubCommand::Logout(session) => {
                    if self
                        .sessions
                        .get(&session.user)
                        .is_some_and(|p| p.session.generation == session.generation)
                    {
                        self.sessions.remove(&session.user);
                        self.broadcast(&frame("userLeft", json!({"userID":session.user})));
                    }
                    for entry in self.tables.values() {
                        entry.handle.cleanup.notify_one();
                    }
                }
                HubCommand::Create {
                    session,
                    player,
                    name,
                    deck,
                    reply,
                } => {
                    if self.closing
                        || player.id != session.user
                        || !self.current(&session)
                        || self
                            .sessions
                            .get(&session.user)
                            .is_some_and(|p| p.table.is_some())
                    {
                        let _ = reply.send(Err(anyhow::anyhow!(
                            "Leave the current table before creating another"
                        )));
                        continue;
                    }
                    match self.allocate() {
                        Ok(allocation) => {
                            let id = allocation.id;
                            let actor = TableActor::pregame(
                                id,
                                name,
                                player,
                                deck,
                                self.store.clone(),
                                self.sender.clone(),
                                allocation.permit,
                            );
                            let handle = self.spawn(actor, Some((session, reply)));
                            self.tables.insert(
                                id,
                                Entry {
                                    handle: handle.clone(),
                                    view: None,
                                },
                            );
                        }
                        Err(error) => {
                            let _ = reply.send(Err(error));
                        }
                    }
                }
                HubCommand::Allocate(reply) => {
                    let result = if self.closing {
                        Err(anyhow::anyhow!("Draining"))
                    } else {
                        self.allocate()
                    };
                    let _ = reply.send(result);
                }
                HubCommand::Replay {
                    session,
                    snapshot,
                    allocation,
                    reply,
                } => {
                    if self.closing
                        || !self.current(&session)
                        || self
                            .sessions
                            .get(&session.user)
                            .is_some_and(|p| p.table.is_some())
                    {
                        let _ = reply.send(Err(anyhow::anyhow!(
                            "Leave the current table before creating a replay"
                        )));
                        continue;
                    }
                    let id = snapshot.table_id;
                    if id != allocation.id {
                        let _ = reply.send(Err(anyhow::anyhow!("Mismatched table allocation")));
                        continue;
                    }
                    let actor = TableActor::replay(
                        *snapshot,
                        self.store.clone(),
                        self.sender.clone(),
                        allocation.permit,
                    );
                    let handle = self.spawn(actor, Some((session, reply)));
                    self.tables.insert(
                        id,
                        Entry {
                            handle: handle.clone(),
                            view: None,
                        },
                    );
                }
                HubCommand::Route {
                    session,
                    table,
                    command,
                    reply,
                } => {
                    if self.closing || !self.current(&session) {
                        let _ =
                            reply.send(Err(anyhow::anyhow!("Stale session or draining server")));
                    } else if self
                        .sessions
                        .get(&session.user)
                        .is_some_and(|p| match &command {
                            Command::Join(_) | Command::Reattend => {
                                p.table.is_some_and(|current| current != table)
                            }
                            _ => p.table != Some(table),
                        })
                    {
                        let _ = reply.send(Err(anyhow::anyhow!(
                            "Attend this table before issuing commands"
                        )));
                    } else if let Some(entry) = self.tables.get(&table) {
                        if let Err(error) = entry.handle.sender.try_send(TableCommand::Client {
                            session,
                            command,
                            reply,
                        }) && let TableCommand::Client { reply, .. } = error.into_inner()
                        {
                            let _ = reply.send(Err(anyhow::anyhow!("Table queue unavailable")));
                        }
                    } else {
                        let _ = reply.send(Err(anyhow::anyhow!("Unknown table")));
                    }
                }
                HubCommand::Name { session, reply } => {
                    if self.closing || !self.current(&session) {
                        let _ = reply.send(Err(anyhow::anyhow!("Session unavailable")));
                    } else {
                        session.emit(&frame("name", json!({"name":random_name(&self.words)})));
                        let _ = reply.send(Ok(()));
                    }
                }
                HubCommand::Effects(effects) => {
                    let mut changed = false;
                    if let Some(entry) = self.tables.get_mut(&effects.table) {
                        changed = entry.view.as_ref() != Some(&effects.view);
                        entry.view = Some(effects.view);
                    }
                    for (session, status, table) in effects.statuses {
                        if self.current(&session) {
                            if let Some(presence) = self.sessions.get_mut(&session.user) {
                                presence.status = status;
                                presence.table = table;
                            }
                            if let Some(presence) = self.sessions.get(&session.user) {
                                self.broadcast(&frame("user", Self::user(presence)));
                            }
                        }
                    }
                    if let Some(view) = self
                        .tables
                        .get(&effects.table)
                        .and_then(|entry| entry.view.as_ref())
                        .filter(|v| changed && v.visible)
                    {
                        for presence in self.sessions.values() {
                            presence.session.emit(&frame(
                                "table",
                                Self::table_for(view, presence.session.user),
                            ));
                        }
                    }
                    for (session, message) in effects.messages {
                        if self.current(&session) {
                            session.emit(&message);
                        }
                    }
                }
                HubCommand::Retire(id) => {
                    if self
                        .tables
                        .remove(&id)
                        .is_some_and(|entry| entry.view.is_some_and(|view| view.visible))
                    {
                        self.broadcast(&frame("tableGone", json!({"tableID":id})));
                    }
                }
                HubCommand::Quiesce(reply) => {
                    self.closing = true;
                    let _ = reply.send(
                        self.tables
                            .values()
                            .map(|entry| entry.handle.clone())
                            .collect(),
                    );
                }
                HubCommand::Stop(reply) => {
                    for presence in self.sessions.values() {
                        presence.session.cancel.cancel();
                    }
                    let _ = reply.send(());
                    break;
                }
            }
        }
    }
}

fn random_name(words: &[String]) -> String {
    let mut selected = Vec::new();
    let mut result = Vec::new();
    let mut random = rand::thread_rng();
    for _ in 0..3 {
        let mut index = random.gen_range(0..words.len() - selected.len());
        for previous in &selected {
            if index >= *previous {
                index += 1;
            }
        }
        result.push(words[index].as_str());
        selected.push(index);
        selected.sort_unstable();
    }
    result.join(" ")
}

enum State {
    Pregame {
        players: Vec<Player>,
        input: Option<Vec<Card>>,
    },
    Live(Box<Snapshot>),
    Replay(Box<Snapshot>),
    Frozen(Box<Snapshot>),
}
struct Attendance {
    session: Arc<Session>,
    loaded: bool,
}
struct TableActor {
    id: u64,
    name: String,
    owner: i32,
    visible: bool,
    state: State,
    revision: i64,
    attendees: HashMap<i32, Attendance>,
    cleanup: Arc<Notify>,
    store: Store,
    hub: mpsc::Sender<HubCommand>,
    anchor: std::time::Instant,
    _permit: OwnedSemaphorePermit,
}

impl TableActor {
    fn pregame(
        id: u64,
        name: String,
        player: Player,
        input: Option<Vec<Card>>,
        store: Store,
        hub: mpsc::Sender<HubCommand>,
        permit: OwnedSemaphorePermit,
    ) -> Self {
        Self {
            id,
            name,
            owner: player.id,
            visible: true,
            state: State::Pregame {
                players: vec![player],
                input,
            },
            revision: 0,
            attendees: HashMap::new(),
            cleanup: Arc::new(Notify::new()),
            store,
            hub,
            anchor: std::time::Instant::now(),
            _permit: permit,
        }
    }
    fn live(
        snapshot: Snapshot,
        revision: i64,
        store: Store,
        hub: mpsc::Sender<HubCommand>,
        permit: OwnedSemaphorePermit,
    ) -> Self {
        Self {
            id: snapshot.table_id,
            name: snapshot.name.clone(),
            owner: snapshot.owner,
            visible: true,
            state: State::Live(Box::new(snapshot)),
            revision,
            attendees: HashMap::new(),
            cleanup: Arc::new(Notify::new()),
            store,
            hub,
            anchor: std::time::Instant::now(),
            _permit: permit,
        }
    }
    fn replay(
        snapshot: Snapshot,
        store: Store,
        hub: mpsc::Sender<HubCommand>,
        permit: OwnedSemaphorePermit,
    ) -> Self {
        let mut actor = Self::live(snapshot, 0, store, hub, permit);
        if let State::Live(snapshot) = actor.state {
            actor.state = State::Replay(snapshot);
        }
        actor.visible = false;
        actor
    }
    fn players(&self) -> &[Player] {
        match &self.state {
            State::Pregame { players, .. } => players,
            State::Live(s) | State::Replay(s) | State::Frozen(s) => &s.players,
        }
    }
    fn view(&self) -> TableView {
        let replay = matches!(self.state, State::Replay(_));
        let progress = match &self.state {
            State::Pregame { .. } => 0,
            State::Live(s) | State::Replay(s) | State::Frozen(s) => u32::from(s.game.score) * 4,
        };
        TableView {
            players: self.players().iter().map(|p| p.id).collect(),
            replay,
            visible: self.visible,
            data: json!({"id":self.id,"joined":false,"maxPlayers":2,"name":self.name,
                "numPlayers":self.players().len(),"options":game::options(),"ownerID":self.owner,
                "passwordProtected":false,"players":self.players().iter().map(|p|&p.name).collect::<Vec<_>>(),
                "progress":progress,"running":!matches!(self.state,State::Pregame{..}),"sharedReplay":replay&&self.visible,
                "spectators":[],"timeBase":0,"timePerTurn":0,"timed":false,"variant":"No Variant"}),
        }
    }
    fn effects(&self) -> Effects {
        Effects {
            table: self.id,
            view: self.view(),
            statuses: Vec::new(),
            messages: Vec::new(),
        }
    }
    async fn publish(&self, effects: Effects) -> Result<()> {
        self.hub
            .send(HubCommand::Effects(effects))
            .await
            .context("Coordinator stopped")
    }
    fn attending(&self, session: &Session) -> bool {
        session.active()
            && self
                .attendees
                .get(&session.user)
                .is_some_and(|a| a.session.generation == session.generation)
    }
    fn pregame_messages(&self, effects: &mut Effects) {
        for attendee in self.attendees.values().filter(|a| a.session.active()) {
            effects.messages.push((attendee.session.clone(), frame("game", json!({
                "tableID":self.id,"name":self.name,"owner":self.owner,
                "players":self.players().iter().enumerate().map(|(index,p)|json!({
                    "index":index,"name":p.name,"you":p.id==attendee.session.user,
                    "present":self.attendees.get(&p.id).is_some_and(|a|a.session.active()),"stats":p.stats
                })).collect::<Vec<_>>(),"options":game::options(),"passwordProtected":false,"maxPlayers":2
            }))));
        }
    }
    async fn initialize_attendance(&mut self, session: Arc<Session>) -> Result<()> {
        self.attendees.insert(
            session.user,
            Attendance {
                session: session.clone(),
                loaded: false,
            },
        );
        let mut effects = self.effects();
        if matches!(self.state, State::Pregame { .. }) {
            effects.statuses.push((session.clone(), 1, Some(self.id)));
            self.pregame_messages(&mut effects);
            effects
                .messages
                .push((session, frame("joined", json!({"tableID":self.id}))));
        } else {
            effects.statuses.push((session.clone(), 4, Some(self.id)));
            effects.messages.push((
                session,
                frame("tableStart", json!({"tableID":self.id,"replay":true})),
            ));
        }
        self.publish(effects).await
    }

    async fn run(
        mut self,
        mut receiver: mpsc::Receiver<TableCommand>,
        initial: Option<(Arc<Session>, Reply)>,
    ) {
        // Establish ownership before polling either commands or coalesced cleanup.
        if let Some((session, reply)) = initial {
            let result = self.initialize_attendance(session).await;
            let failed = result.is_err();
            let _ = reply.send(result);
            if failed {
                return;
            }
        }
        loop {
            let previous_attendees = self.attendees.len();
            self.attendees
                .retain(|_, attendee| attendee.session.active());
            if self.attendees.len() != previous_attendees && matches!(self.state, State::Live(_)) {
                let mut effects = self.effects();
                for attendee in self.attendees.values() {
                    effects
                        .messages
                        .push((attendee.session.clone(), self.connected_message()));
                }
                if let Err(error) = self.publish(effects).await {
                    eprintln!("Failed to publish disconnect state: {error}");
                    break;
                }
            }
            if matches!(self.state, State::Replay(_)) && self.attendees.is_empty() {
                if self.hub.send(HubCommand::Retire(self.id)).await.is_err() {
                    eprintln!("Coordinator stopped before replay cleanup");
                }
                break;
            }
            tokio::select! {
                command = receiver.recv() => {
                    let Some(command) = command else { break; };
                    match command {
                        TableCommand::Drain(reply) => {
                            let result = if let State::Live(snapshot) = &self.state {
                                self.persist(self.candidate(snapshot)).await
                            } else { Ok(()) };
                            let _ = reply.send(result);
                            break;
                        }
                        TableCommand::Client { session, command, reply } => {
                            let result = if !session.active() { Err(anyhow::anyhow!("Stale session")) } else { self.command(session, command).await };
                            let _ = reply.send(result);
                        }
                    }
                }
                _ = self.cleanup.notified() => {}
            }
        }
        receiver.close();
        while let Ok(command) = receiver.try_recv() {
            match command {
                TableCommand::Drain(reply) => {
                    let _ = reply.send(Ok(()));
                }
                TableCommand::Client { reply, .. } => {
                    let _ = reply.send(Err(anyhow::anyhow!("Table closed")));
                }
            }
        }
    }

    async fn command(&mut self, session: Arc<Session>, command: Command) -> Result<()> {
        ensure!(
            !matches!(self.state, State::Frozen(_)),
            "Table frozen after uncertain storage; restart to recover"
        );
        match command {
            Command::Join(player) => {
                ensure!(
                    player.id == session.user,
                    "Player identity does not match the session"
                );
                let State::Pregame { players, .. } = &mut self.state else {
                    bail!("The table has started")
                };
                ensure!(
                    players.len() < 2 && !players.iter().any(|p| p.id == session.user),
                    "Table is full or already joined"
                );
                players.push(player);
                self.attendees.insert(
                    session.user,
                    Attendance {
                        session: session.clone(),
                        loaded: false,
                    },
                );
                let mut effects = self.effects();
                effects.statuses.push((session.clone(), 1, Some(self.id)));
                self.pregame_messages(&mut effects);
                effects
                    .messages
                    .push((session, frame("joined", json!({"tableID":self.id}))));
                self.publish(effects).await
            }
            Command::Start(request) => self.start(session, request).await,
            Command::Reattend => {
                ensure!(
                    self.players().iter().any(|p| p.id == session.user),
                    "Not a player of this table"
                );
                self.attendees.insert(
                    session.user,
                    Attendance {
                        session: session.clone(),
                        loaded: false,
                    },
                );
                let mut effects = self.effects();
                let replay = matches!(self.state, State::Replay(_));
                if matches!(self.state, State::Pregame { .. }) {
                    effects.statuses.push((session.clone(), 1, Some(self.id)));
                    self.pregame_messages(&mut effects);
                    effects
                        .messages
                        .push((session, frame("joined", json!({"tableID":self.id}))));
                    return self.publish(effects).await;
                }
                effects
                    .statuses
                    .push((session.clone(), if replay { 5 } else { 2 }, Some(self.id)));
                effects.messages.push((
                    session,
                    frame("tableStart", json!({"tableID":self.id,"replay":replay})),
                ));
                self.publish(effects).await
            }
            Command::Unattend => {
                ensure!(
                    self.attending(&session),
                    "Reattend before leaving this table"
                );
                self.attendees.remove(&session.user);
                let mut effects = self.effects();
                effects.statuses.push((session, 0, None));
                self.publish(effects).await
            }
            Command::Info(part) => self.info(session, part).await,
            Command::Loaded(request) => {
                ensure!(self.attending(&session), "Reattend before loading");
                if let State::Live(snapshot) = &self.state
                    && !snapshot.duplicate(session.user, request.as_deref())
                {
                    let mut next = self.candidate(snapshot);
                    if next.players[next.game.active].id == session.user {
                        next.timer_started = true;
                    }
                    next.remember(session.user, request.as_deref())?;
                    self.persist(next).await?;
                }
                if let Some(attendee) = self.attendees.get_mut(&session.user) {
                    attendee.loaded = true;
                }
                let mut effects = self.effects();
                for attendee in self.attendees.values().filter(|a| a.session.active()) {
                    effects
                        .messages
                        .push((attendee.session.clone(), self.connected_message()));
                    if let State::Live(snapshot) = &self.state {
                        effects
                            .messages
                            .push((attendee.session.clone(), self.clock_message(snapshot)));
                    }
                }
                self.publish(effects).await
            }
            Command::Action(action, request) => {
                ensure!(self.attending(&session), "Reattend before acting");
                let State::Live(snapshot) = &self.state else {
                    bail!("Not an ongoing game")
                };
                if snapshot.duplicate(session.user, request.as_deref()) {
                    return Ok(());
                }
                let seat = snapshot
                    .players
                    .iter()
                    .position(|p| p.id == session.user)
                    .context("Not a player")?;
                let mut next = self.candidate(snapshot);
                next.remember(session.user, request.as_deref())?;
                let from = next.game.events.len();
                next.game.apply(seat, action)?;
                next.timer_started = true;
                next.turn_elapsed = 0;
                if next.game.end != 0 {
                    next.finished = Some(Utc::now());
                }
                self.persist(next).await?;
                let (snapshot, replay) = match &self.state {
                    State::Live(s) => (s, false),
                    State::Replay(s) => (s, true),
                    _ => bail!("Game unavailable"),
                };
                let mut effects = self.effects();
                for attendee in self
                    .attendees
                    .values()
                    .filter(|a| a.loaded && a.session.active())
                {
                    let seat = snapshot
                        .players
                        .iter()
                        .position(|p| p.id == attendee.session.user);
                    for event in snapshot.game.projected(seat, from) {
                        effects.messages.push((
                            attendee.session.clone(),
                            frame("gameAction", json!({"tableID":self.id,"action":event})),
                        ));
                    }
                    if replay {
                        effects.messages.push((attendee.session.clone(), frame("gameAction", json!({
                            "tableID":self.id,"action":{"type":"playerTimes","playerTimes":snapshot.clocks,"duration":snapshot.duration}
                        }))));
                    } else {
                        effects
                            .messages
                            .push((attendee.session.clone(), self.clock_message(snapshot)));
                    }
                }
                if replay {
                    let count = self.store.seed_count(&snapshot.seed).await?;
                    for attendee in self.attendees.values().filter(|a| a.session.active()) {
                        effects
                            .statuses
                            .push((attendee.session.clone(), 5, Some(self.id)));
                        effects.messages.push((
                            attendee.session.clone(),
                            frame("gameHistory", json!([snapshot.history(count, true)])),
                        ));
                        effects.messages.push((attendee.session.clone(),frame("finishOngoingGame",json!({"tableID":self.id,"databaseID":snapshot.game_id,
                            "sharedReplayLeader":snapshot.players.iter().find(|p|p.id==self.owner).map(|p|p.name.as_str()).unwrap_or("")}))));
                    }
                }
                self.publish(effects).await
            }
        }
    }

    async fn start(&mut self, session: Arc<Session>, request: Option<String>) -> Result<()> {
        ensure!(
            session.user == self.owner && self.attending(&session),
            "Only the attended owner can start"
        );
        let State::Pregame { players, input } = &self.state else {
            bail!("Already started")
        };
        ensure!(
            players.len() == 2
                && players.iter().all(|p| self
                    .attendees
                    .get(&p.id)
                    .is_some_and(|a| a.session.active())),
            "Exactly two present players required"
        );
        let mut players: [Player; 2] = players
            .clone()
            .try_into()
            .map_err(|_| anyhow::anyhow!("Invalid roster"))?;
        let ids: Vec<i32> = players.iter().map(|p| p.id).collect();
        let seeds:Vec<String> = sqlx::query_scalar("SELECT DISTINCT g.seed FROM games g JOIN game_participants p ON p.game_id=g.id
            WHERE p.user_id=ANY($1) OR p.user_id IN (SELECT linked_id FROM user_linkages WHERE user_id=ANY($1))")
            .bind(ids).fetch_all(&self.store.primary).await?;
        let mut suffix = 1;
        while seeds.contains(&format!("p2v0s{suffix}")) {
            suffix += 1;
        }
        let seed = format!("p2v0s{suffix}");
        let mut deck = input.clone().unwrap_or_else(game::unshuffled_deck);
        let mut random = GoRandom::new(seed_hash(&seed)?);
        random.shuffle(&mut deck);
        random.shuffle(&mut players);
        ensure!(
            session.active(),
            "Owner disconnected during start preparation"
        );
        let now = Utc::now();
        let mut snapshot = Snapshot {
            format: FORMAT.into(),
            table_id: self.id,
            game_id: self.store.reserve().await?,
            owner: self.owner,
            name: self.name.clone(),
            players,
            seed,
            created: now,
            started: now,
            finished: None,
            game: Game::new(deck)?,
            clocks: [0, 0],
            duration: 0,
            turn_elapsed: 0,
            timer_started: false,
            receipts: Vec::new(),
        };
        snapshot.remember(session.user, request.as_deref())?;
        self.persist(snapshot).await?;
        for attendee in self.attendees.values_mut() {
            attendee.loaded = false;
        }
        let mut effects = self.effects();
        for attendee in self.attendees.values().filter(|a| a.session.active()) {
            effects
                .statuses
                .push((attendee.session.clone(), 2, Some(self.id)));
            effects.messages.push((
                attendee.session.clone(),
                frame("tableStart", json!({"tableID":self.id,"replay":false})),
            ));
        }
        self.publish(effects).await
    }

    fn connected_message(&self) -> String {
        frame(
            "connected",
            json!({"tableID":self.id,
            "list":self.players().iter().map(|p|self.attendees.get(&p.id).is_some_and(|a|a.loaded&&a.session.active())).collect::<Vec<_>>()}),
        )
    }

    fn clock_message(&self, snapshot: &Snapshot) -> String {
        let mut clocks = snapshot.clocks;
        let mut elapsed = snapshot.turn_elapsed;
        if snapshot.timer_started && snapshot.game.end == 0 {
            let delta = self.anchor.elapsed().as_millis().min(i64::MAX as u128) as i64;
            clocks[snapshot.game.active] -= delta;
            elapsed += delta;
        }
        frame(
            "clock",
            json!({"tableID":self.id,"times":clocks,"activePlayerIndex":snapshot.game.active,"timeTaken":elapsed}),
        )
    }

    fn candidate(&self, snapshot: &Snapshot) -> Snapshot {
        let mut next = snapshot.clone();
        let elapsed = self.anchor.elapsed().as_millis().min(i64::MAX as u128) as i64;
        next.duration += elapsed;
        if next.timer_started && next.game.end == 0 {
            next.clocks[next.game.active] -= elapsed;
            next.turn_elapsed += elapsed;
        }
        next
    }

    async fn persist(&mut self, mut next: Snapshot) -> Result<()> {
        match self.store.save(&next, self.revision).await {
            Ok(revision) => self.revision = revision,
            Err(error) => {
                self.state = State::Frozen(Box::new(next));
                eprintln!("Table {} checkpoint uncertain: {error}", self.id);
                bail!("Storage result is uncertain; table frozen until recovery");
            }
        }
        if next.game.end != 0 {
            match self.store.complete(&next, self.revision).await {
                Ok((started, finished)) => {
                    next.started = started;
                    next.finished = Some(finished);
                }
                Err(error) => {
                    self.state = State::Frozen(Box::new(next));
                    eprintln!("Table {} completion uncertain: {error}", self.id);
                    bail!("Completion uncertain; table frozen until recovery");
                }
            }
            self.store.refresh_background(next.clone());
            self.state = State::Replay(Box::new(next));
        } else {
            self.state = State::Live(Box::new(next));
        }
        self.anchor = std::time::Instant::now();
        Ok(())
    }

    async fn info(&self, session: Arc<Session>, part: u8) -> Result<()> {
        ensure!(
            self.attending(&session),
            "Reattend before requesting private game data"
        );
        let (s, replay) = match &self.state {
            State::Live(s) => (s, false),
            State::Replay(s) => (s, true),
            _ => bail!("No available game"),
        };
        let seat = s
            .players
            .iter()
            .position(|p| p.id == session.user)
            .unwrap_or(0);
        let mut effects = self.effects();
        if part == 1 {
            effects.messages.push((session.clone(),frame("init",json!({
                "tableID":self.id,"playerNames":s.players.iter().map(|p|&p.name).collect::<Vec<_>>(),
                "ourPlayerIndex":seat,"spectating":false,"shadowing":false,"replay":replay,
                "databaseID":if replay{s.game_id}else{-1},"hasCustomSeed":replay,"seed":s.seed,
                "datetimeStarted":s.started,"datetimeFinished":s.finished.map(|d|d.to_rfc3339()).unwrap_or_else(||"0001-01-01T00:00:00Z".into()),
                "options":game::options(),"characterAssignments":[],"characterMetadata":[],
                "sharedReplay":replay&&self.visible,"sharedReplayLeader":s.players.iter().find(|p|p.id==self.owner).map(|p|p.name.as_str()).unwrap_or(&session.name),
                "sharedReplaySegment":s.game.turn,"sharedReplayEffMod":0,"paused":false,"pausePlayerIndex":-1,"pauseQueued":false
            }))));
        } else {
            effects.messages.push((session.clone(),frame("gameActionList",json!({"tableID":self.id,"list":s.game.projected(if replay{None}else{Some(seat)},0)}))));
            if replay {
                effects.messages.push((
                    session.clone(),
                    frame(
                        "cardIdentities",
                        json!({"tableID":self.id,"cardIdentities":s.game.deck}),
                    ),
                ));
                effects.messages.push((session.clone(),frame("noteList",json!({"tableID":self.id,"notes":s.players.iter().map(|p|json!({"name":p.name,"notes":vec!["";55],"isSpectator":false})).collect::<Vec<_>>()}))));
            } else {
                effects
                    .messages
                    .push((session.clone(), self.connected_message()));
                effects
                    .messages
                    .push((session.clone(), self.clock_message(s)));
                effects.messages.push((
                    session.clone(),
                    frame(
                        "noteListPlayer",
                        json!({"tableID":self.id,"notes":vec!["";55]}),
                    ),
                ));
                effects
                    .messages
                    .push((session.clone(), frame("voteChange", json!({"vote":false}))));
            }
            effects.messages.push((
                session.clone(),
                frame("chatList", json!({"list":[],"unread":0})),
            ));
            effects.messages.push((
                session,
                frame("spectators", json!({"tableID":self.id,"spectators":[]})),
            ));
        }
        self.publish(effects).await
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::time::Duration;

    fn fixture() -> Hub {
        let (sender, receiver) = mpsc::channel(16);
        Hub {
            receiver,
            sender,
            sessions: HashMap::new(),
            tables: HashMap::new(),
            next: 1,
            closing: false,
            store: Store::disconnected_fixture(),
            words: Arc::new(vec!["alpha".into(), "beta".into(), "gamma".into()]),
            tasks: TaskTracker::new(),
            capacity: Arc::new(Semaphore::new(1)),
        }
    }

    async fn result(receiver: oneshot::Receiver<Result<()>>) -> Result<()> {
        tokio::time::timeout(Duration::from_secs(1), receiver).await???;
        Ok(())
    }

    #[tokio::test]
    async fn pending_allocations_hold_capacity_and_cancellation_releases_it() {
        let mut hub = fixture();
        let first = hub.allocate().unwrap();
        assert!(hub.allocate().is_err());
        let id = first.id;
        drop(first);
        let next = hub.allocate().unwrap();
        assert!(next.id > id);
    }

    fn replay_fixture() -> Snapshot {
        let mut game = Game::new(vec![
            Card {
                suit_index: 0,
                rank: 1
            };
            50
        ])
        .unwrap();
        game.apply(
            0,
            Action {
                kind: 0,
                target: 0,
                value: 0,
            },
        )
        .unwrap();
        let now = Utc::now();
        let snapshot = Snapshot {
            format: FORMAT.into(),
            table_id: 1,
            game_id: 1,
            owner: 1,
            name: "Replay".into(),
            players: [
                Player {
                    id: 1,
                    name: "Alice".into(),
                    stats: crate::store::zero_stats(),
                },
                Player {
                    id: 2,
                    name: "Bob".into(),
                    stats: crate::store::zero_stats(),
                },
            ],
            seed: "p2v0s1".into(),
            created: now,
            started: now,
            finished: Some(now),
            game,
            clocks: [0, 0],
            duration: 0,
            turn_elapsed: 0,
            timer_started: true,
            receipts: Vec::new(),
        };
        snapshot.validate().unwrap();
        snapshot
    }

    #[tokio::test]
    async fn replay_retirement_acknowledges_an_already_queued_shutdown() {
        let snapshot = replay_fixture();
        let (hub, _effects) = mpsc::channel(8);
        let capacity = Arc::new(Semaphore::new(1));
        let mut actor = TableActor::replay(
            snapshot,
            Store::disconnected_fixture(),
            hub,
            capacity.clone().try_acquire_owned().unwrap(),
        );
        let (session, _outgoing) = Session::new(1, "Alice".into(), 1, false);
        actor.attendees.insert(
            1,
            Attendance {
                session: session.clone(),
                loaded: true,
            },
        );
        let (sender, receiver) = mpsc::channel(8);
        let (left, leaving) = oneshot::channel();
        sender
            .try_send(TableCommand::Client {
                session,
                command: Command::Unattend,
                reply: left,
            })
            .unwrap();
        let (drain, drained) = oneshot::channel();
        sender.try_send(TableCommand::Drain(drain)).unwrap();
        let task = tokio::spawn(actor.run(receiver, None));
        result(leaving).await.unwrap();
        result(drained).await.unwrap();
        task.await.unwrap();
        assert_eq!(capacity.available_permits(), 1);
    }

    #[tokio::test]
    async fn cleanup_cannot_overtake_initial_replay_attendance() {
        let (hub, _effects) = mpsc::channel(8);
        let capacity = Arc::new(Semaphore::new(1));
        let actor = TableActor::replay(
            replay_fixture(),
            Store::disconnected_fixture(),
            hub,
            capacity.clone().try_acquire_owned().unwrap(),
        );
        actor.cleanup.notify_one();
        let (session, _outgoing) = Session::new(1, "Alice".into(), 1, false);
        let (sender, receiver) = mpsc::channel(8);
        let (created, initialized) = oneshot::channel();
        let (info, received) = oneshot::channel();
        sender
            .try_send(TableCommand::Client {
                session: session.clone(),
                command: Command::Info(1),
                reply: info,
            })
            .unwrap();
        let task = tokio::spawn(actor.run(receiver, Some((session, created))));
        result(initialized).await.unwrap();
        result(received).await.unwrap();
        let (drain, drained) = oneshot::channel();
        sender.send(TableCommand::Drain(drain)).await.unwrap();
        result(drained).await.unwrap();
        task.await.unwrap();
        assert_eq!(capacity.available_permits(), 1);
    }

    #[tokio::test]
    async fn full_table_mailboxes_do_not_block_the_hub_and_replacements_fence_private_frames() {
        let mut hub = fixture();
        let sender = hub.sender.clone();
        let (old, mut old_frames) = Session::new(1, "Alice".into(), 1, false);
        hub.sessions.insert(
            1,
            Presence {
                session: old.clone(),
                status: 0,
                table: Some(42),
            },
        );
        let (table_sender, _table_receiver) = mpsc::channel(1);
        let (drain, _drained) = oneshot::channel();
        table_sender.try_send(TableCommand::Drain(drain)).unwrap();
        hub.tables.insert(
            42,
            Entry {
                handle: TableHandle {
                    sender: table_sender,
                    cleanup: Arc::new(Notify::new()),
                },
                view: None,
            },
        );
        let task = tokio::spawn(hub.run());
        let (reply, received) = oneshot::channel();
        sender
            .send(HubCommand::Route {
                session: old.clone(),
                table: 42,
                command: Command::Info(1),
                reply,
            })
            .await
            .unwrap();
        assert!(result(received).await.is_err());
        let (reply, received) = oneshot::channel();
        sender
            .send(HubCommand::Name {
                session: old.clone(),
                reply,
            })
            .await
            .unwrap();
        result(received).await.unwrap();
        assert!(old_frames.try_recv().is_ok());

        let (new, mut new_frames) = Session::new(1, "Alice".into(), 2, false);
        let (reply, received) = oneshot::channel();
        sender
            .send(HubCommand::Register {
                session: new.clone(),
                welcome: json!({}),
                initial: Vec::new(),
                reply,
            })
            .await
            .unwrap();
        result(received).await.unwrap();
        assert!(!old.active());
        sender.send(HubCommand::Logout(old.clone())).await.unwrap();
        sender
            .send(HubCommand::Effects(Effects {
                table: 42,
                view: TableView {
                    players: vec![1],
                    replay: false,
                    visible: false,
                    data: json!({}),
                },
                statuses: vec![(old.clone(), 2, Some(42))],
                messages: vec![(old.clone(), "secret private frame".into())],
            }))
            .await
            .unwrap();
        let (reply, received) = oneshot::channel();
        sender
            .send(HubCommand::Name {
                session: new.clone(),
                reply,
            })
            .await
            .unwrap();
        result(received).await.unwrap();
        assert!(new.active());
        while let Ok(frame) = new_frames.try_recv() {
            assert!(!frame.message.to_text().unwrap().contains("secret"));
        }
        assert!(old_frames.try_recv().is_err());
        let (reply, received) = oneshot::channel();
        sender
            .send(HubCommand::Route {
                session: old,
                table: 42,
                command: Command::Info(1),
                reply,
            })
            .await
            .unwrap();
        assert!(result(received).await.is_err());
        let (reply, received) = oneshot::channel();
        sender.send(HubCommand::Stop(reply)).await.unwrap();
        received.await.unwrap();
        task.await.unwrap();
    }
}
