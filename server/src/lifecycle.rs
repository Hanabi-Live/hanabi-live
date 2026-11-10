use crate::{
    actors::{HubCommand, Inspection, TableCommand, request},
    integrations::IntegrationSlot,
    operations::Operation,
    store::Store,
    web::App,
};
use anyhow::{Result, ensure};
use sqlx::PgPool;
use std::{
    path::PathBuf,
    sync::{
        Arc,
        atomic::{AtomicU8, Ordering},
    },
    time::Instant,
};
use tokio::sync::{OwnedRwLockReadGuard, RwLock, mpsc, oneshot};
use tokio_util::{sync::CancellationToken, task::TaskTracker};

/// Where the server is in its life. Each state admits less work than the one before it, except
/// `Starting`.
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
#[repr(u8)]
pub enum Phase {
    /// The server restores its tables and starts its listeners. It admits no work yet.
    Starting,
    /// The server admits all work.
    Running,
    /// An administrator asked the server to stop. Players can still play, but no other lifecycle
    /// operation is admitted.
    StopRequested,
    /// The server admits no new work and waits for admitted work to finish.
    Draining,
}

/// Why work was not admitted.
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum Refusal {
    /// The server lost ownership of the live tables or is shutting down.
    Unavailable,
    /// The server is starting, stopping, or draining.
    NotAccepting,
}

/// The server's lifecycle state, which every listener shares. Admitted work holds a read lock on
/// the admission gate, so a drain can wait for all of it.
pub struct Lifecycle {
    phase: AtomicU8,
    admission: Arc<RwLock<()>>,
    /// Cancelled when the server stops its listeners and background work.
    pub shutdown: CancellationToken,
    /// Cancelled when a drain begins, to end optional reads early.
    pub read_shutdown: CancellationToken,
    /// Cancelled when the server loses ownership of the live tables.
    pub ownership_lost: CancellationToken,
}

impl Lifecycle {
    pub fn new(ownership_lost: CancellationToken) -> Arc<Self> {
        Arc::new(Self {
            phase: AtomicU8::new(Phase::Starting as u8),
            admission: Arc::new(RwLock::new(())),
            shutdown: CancellationToken::new(),
            read_shutdown: CancellationToken::new(),
            ownership_lost,
        })
    }
    pub fn phase(&self) -> Phase {
        match self.phase.load(Ordering::Acquire) {
            0 => Phase::Starting,
            1 => Phase::Running,
            2 => Phase::StopRequested,
            _ => Phase::Draining,
        }
    }
    fn transition(&self, from: Phase, to: Phase) -> bool {
        self.phase
            .compare_exchange(from as u8, to as u8, Ordering::AcqRel, Ordering::Acquire)
            .is_ok()
    }
    /// Starts admitting work once startup has finished.
    pub fn activate(&self) {
        self.transition(Phase::Starting, Phase::Running);
    }
    /// Whether the server still owns the live tables and is not shutting down.
    pub fn healthy(&self) -> bool {
        !self.shutdown.is_cancelled() && !self.ownership_lost.is_cancelled()
    }
    /// Whether players' work is admitted.
    pub fn accepting(&self) -> bool {
        matches!(self.phase(), Phase::Running | Phase::StopRequested)
    }
    pub fn draining(&self) -> bool {
        matches!(self.phase(), Phase::StopRequested | Phase::Draining)
    }
    fn check(&self, accepting: bool) -> Result<(), Refusal> {
        if !self.healthy() {
            Err(Refusal::Unavailable)
        } else if !accepting {
            Err(Refusal::NotAccepting)
        } else {
            Ok(())
        }
    }
    /// Admits a player's work. A drain waits until the returned guard is dropped.
    pub async fn admit(&self) -> Result<OwnedRwLockReadGuard<()>, Refusal> {
        let guard = self.admission.clone().read_owned().await;
        self.check(self.accepting())?;
        Ok(guard)
    }
    /// Admits an administrator's operation, which only a running server accepts.
    pub async fn admit_operation(&self) -> Result<OwnedRwLockReadGuard<()>, Refusal> {
        let guard = self.admission.clone().read_owned().await;
        self.check(self.phase() == Phase::Running)?;
        Ok(guard)
    }
    /// Marks a stop as requested. Returns false if the server is not running.
    pub fn request_stop(&self) -> bool {
        self.transition(Phase::Running, Phase::StopRequested)
    }
    /// Withdraws a stop request that could not be sent.
    pub fn withdraw_stop(&self) {
        self.transition(Phase::StopRequested, Phase::Running);
    }
    /// Stops admitting work and ends optional reads.
    pub fn stop_admitting(&self) {
        self.phase.store(Phase::Draining as u8, Ordering::Release);
        self.read_shutdown.cancel();
    }
    /// Stops admitting work and waits for admitted work to finish.
    pub async fn drain(&self) {
        self.stop_admitting();
        drop(self.admission.write().await);
    }
}

#[derive(Debug)]
pub enum StopReason {
    Shutdown,
    /// The optional message is an administrator's plain-text reason for the downtime.
    Restart(Option<String>),
    GracefulStop(Option<String>),
    OwnershipLost,
    Failure(String),
}
impl StopReason {
    fn reconnect(&self) -> bool {
        matches!(self, Self::Restart(_) | Self::GracefulStop(_))
    }
    fn message(&self) -> Option<&str> {
        match self {
            Self::Restart(message) | Self::GracefulStop(message) => message.as_deref(),
            _ => None,
        }
    }
    /// HTML shown to connected users when an administrator explained the downtime.
    fn user_notice(&self) -> Option<String> {
        let reason = crate::accounts::escape_html(self.message()?);
        Some(if matches!(self, Self::Restart(_)) {
            format!("The server is restarting and will be back shortly.<br />Reason: {reason}")
        } else {
            format!(
                "The server is going down for maintenance. Your accepted game progress has been saved.<br />Reason: {reason}"
            )
        })
    }
}
/// What the operations endpoint reports about a running server. Tests without a database leave
/// it out.
pub struct Runtime {
    pub store: Store,
    pub integrations: IntegrationSlot,
}

pub struct Control {
    pub lifecycle: Arc<Lifecycle>,
    pub hub: mpsc::Sender<HubCommand>,
    pub pool: PgPool,
    pub root: PathBuf,
    pub version: String,
    pub started: chrono::DateTime<chrono::Utc>,
    pub monotonic_started: Instant,
    runtime: Option<Runtime>,
    stops: mpsc::Sender<StopReason>,
}
impl Control {
    pub fn new(
        lifecycle: Arc<Lifecycle>,
        hub: mpsc::Sender<HubCommand>,
        pool: PgPool,
        runtime: Option<Runtime>,
        root: PathBuf,
        version: String,
        stops: mpsc::Sender<StopReason>,
    ) -> Arc<Self> {
        Arc::new(Self {
            lifecycle,
            hub,
            pool,
            root,
            version,
            stops,
            started: chrono::Utc::now(),
            monotonic_started: Instant::now(),
            runtime,
        })
    }
    pub fn storage_healthy(&self) -> bool {
        !self.lifecycle.ownership_lost.is_cancelled()
    }
    pub fn store(&self) -> Option<&Store> {
        self.runtime.as_ref().map(|runtime| &runtime.store)
    }
    /// The Discord bridge's status.
    pub fn discord_status(&self) -> &'static str {
        self.runtime
            .as_ref()
            .and_then(|runtime| runtime.integrations.get())
            .map_or("disabled", |integrations| integrations.discord_status())
    }
    pub async fn operation(&self, command: Operation) -> Result<()> {
        request(&self.hub, |reply| HubCommand::Operations { command, reply }).await?
    }
    /// What the hub reports about its tables.
    pub async fn inspect(&self) -> Result<Inspection> {
        request(&self.hub, HubCommand::Inspect).await?
    }
    pub async fn graceful_stop(&self, message: Option<String>) -> Result<()> {
        self.request_stop(StopReason::GracefulStop(message)).await
    }
    pub async fn request_stop(&self, reason: StopReason) -> Result<()> {
        ensure!(
            self.lifecycle.request_stop(),
            "{}",
            if self.lifecycle.draining() {
                "The server is already draining."
            } else {
                "The server is not ready for lifecycle operations."
            }
        );
        if matches!(reason, StopReason::Restart(_))
            && let Err(error) = crate::restart::prepare(&self.root).await
        {
            self.lifecycle.withdraw_stop();
            return Err(error);
        }
        if let Err(error) = self.stops.try_send(reason) {
            self.lifecycle.withdraw_stop();
            return Err(error.into());
        }
        Ok(())
    }
}

/// Formats a duration in words, such as "2 hours and 5 minutes", rounding to the minute after the
/// first minute.
pub fn duration(seconds: u64) -> String {
    const MINUTE: u64 = hanabi_protocol::SECONDS_PER_MINUTE.unsigned_abs() as u64;
    const HOUR: u64 = hanabi_protocol::SECONDS_PER_HOUR.unsigned_abs() as u64;
    const HOURS_PER_DAY: u64 = hanabi_protocol::HOURS_PER_DAY.unsigned_abs() as u64;
    let unit = |n, label| format!("{n} {label}{}", if n == 1 { "" } else { "s" });
    if seconds < MINUTE {
        return unit(seconds, "second");
    }
    if seconds < HOUR {
        return unit((seconds + MINUTE / 2) / MINUTE, "minute");
    }
    let total = seconds / HOUR;
    let days = total.saturating_sub(1) / HOURS_PER_DAY;
    let hours = total - days * HOURS_PER_DAY;
    let minutes = seconds % HOUR / MINUTE;
    if days == 0 {
        format!("{} and {}", unit(hours, "hour"), unit(minutes, "minute"))
    } else {
        format!(
            "{}, {}, and {}",
            unit(days, "day"),
            unit(hours, "hour"),
            unit(minutes, "minute")
        )
    }
}

pub async fn drain_game_runtime(
    app: &App,
    tables: &TaskTracker,
    reason: &StopReason,
) -> Result<()> {
    let mut failures = Vec::new();
    let (reply, received) = oneshot::channel();
    match app.hub.send(HubCommand::Quiesce(reply)).await {
        Ok(()) => match received.await {
            Ok(handles) => {
                let mut acknowledgements = Vec::with_capacity(handles.len());
                let notifications = handles.into_iter().map(|table| async move {
                    let (reply, drained) = oneshot::channel();
                    if table.sender.send(TableCommand::Drain(reply)).await.is_err() {
                        None
                    } else {
                        Some(drained)
                    }
                });
                // A full mailbox must not delay freeze notifications to other tables.
                for drained in futures_util::future::join_all(notifications).await {
                    if let Some(drained) = drained {
                        acknowledgements.push(drained);
                    } else {
                        failures.push("Table stopped before its drain was acknowledged".to_owned());
                    }
                }
                for drained in acknowledgements {
                    match drained.await {
                        Ok(Ok(())) => {}
                        Ok(Err(e)) => failures.push(format!("{e:#}")),
                        Err(e) => failures.push(e.to_string()),
                    }
                }
            }
            Err(error) => failures.push(error.to_string()),
        },
        Err(error) => failures.push(error.to_string()),
    }
    if let Err(error) = app.store.check_state() {
        failures.push(format!("State ownership was lost during drain: {error:#}"));
    }
    if failures.is_empty() {
        match reason {
            StopReason::Restart(message) => app.announce_restart(message.as_deref()).await,
            StopReason::GracefulStop(message) => app.announce_stop(message.as_deref()).await,
            _ => {}
        }
        let closed = request(&app.hub, |reply| HubCommand::Drained {
            reconnect: reason.reconnect(),
            message: reason.user_notice(),
            reply,
        })
        .await;
        match closed {
            Ok(Ok(())) => {}
            Ok(Err(error)) => failures.push(format!("Maintenance close failed: {error:#}")),
            Err(error) => failures.push(format!("{error:#}")),
        }
    }
    if let Err(error) = request(&app.hub, HubCommand::Stop).await {
        failures.push(format!("{error:#}"));
    }
    tables.close();
    tables.wait().await;
    ensure!(
        failures.is_empty(),
        "Durable game drain failed: {}",
        failures.join("; ")
    );
    Ok(())
}

#[cfg(test)]
#[path = "lifecycle_tests.rs"]
mod tests;
