use crate::{
    actors::{HubCommand, TableCommand},
    operations::Operation,
    web::App,
};
use anyhow::{Context, Result, ensure};
use serde_json::{Value, json};
use sqlx::PgPool;
use std::{
    path::PathBuf,
    sync::{
        Arc, OnceLock, Weak,
        atomic::{AtomicBool, Ordering},
    },
    time::Instant,
};
use tokio::sync::{RwLock, mpsc, oneshot};
use tokio_util::task::TaskTracker;

#[derive(Debug)]
pub enum StopReason {
    Shutdown,
    /// The optional message is an administrator's plain-text reason for the downtime.
    Restart(Option<String>),
    GracefulStop(Option<String>),
    LeaseLost,
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
pub struct Control {
    pub hub: mpsc::Sender<HubCommand>,
    pub pool: PgPool,
    pub root: PathBuf,
    pub version: String,
    pub started: chrono::DateTime<chrono::Utc>,
    pub monotonic_started: Instant,
    pub admission: Arc<RwLock<()>>,
    pub accepting: AtomicBool,
    pub draining: AtomicBool,
    stops: mpsc::Sender<StopReason>,
    application: OnceLock<Weak<App>>,
}
impl Control {
    pub fn new(
        hub: mpsc::Sender<HubCommand>,
        pool: PgPool,
        root: PathBuf,
        version: String,
        stops: mpsc::Sender<StopReason>,
    ) -> Arc<Self> {
        Arc::new(Self {
            hub,
            pool,
            root,
            version,
            stops,
            started: chrono::Utc::now(),
            monotonic_started: Instant::now(),
            admission: Arc::new(RwLock::new(())),
            accepting: AtomicBool::new(false),
            draining: AtomicBool::new(false),
            application: OnceLock::new(),
        })
    }
    pub fn attach_application(&self, app: Weak<App>) {
        assert!(
            self.application.set(app).is_ok(),
            "Lifecycle application already attached"
        );
    }
    pub fn storage_healthy(&self) -> bool {
        self.application.get().is_none_or(|app| {
            app.upgrade()
                .is_some_and(|app| app.store.state_health().is_ok())
        })
    }
    pub fn store(&self) -> Option<crate::store::Store> {
        self.application
            .get()
            .and_then(Weak::upgrade)
            .map(|app| app.store.clone())
    }
    pub fn integration_status(&self) -> Value {
        self.application.get().and_then(Weak::upgrade).map_or_else(
            || json!({"discord":"disabled"}),
            |app| app.integration_status(),
        )
    }
    pub fn activate(&self) {
        self.accepting.store(true, Ordering::Release);
    }
    pub async fn operation(&self, command: Operation) -> Result<Value> {
        let (reply, received) = oneshot::channel();
        self.hub
            .send(HubCommand::Operations { command, reply })
            .await
            .context("Hub stopped")?;
        received.await.context("Hub operation was interrupted")?
    }
    pub async fn graceful_stop(&self, message: Option<String>) -> Result<()> {
        self.request_stop(StopReason::GracefulStop(message)).await
    }
    pub async fn request_stop(&self, reason: StopReason) -> Result<()> {
        ensure!(
            self.accepting.load(Ordering::Acquire),
            "The server is not ready for lifecycle operations."
        );
        ensure!(
            !self.draining.swap(true, Ordering::AcqRel),
            "The server is already draining."
        );
        if matches!(reason, StopReason::Restart(_))
            && let Err(error) = crate::restart::prepare(&self.root).await
        {
            self.draining.store(false, Ordering::Release);
            return Err(error);
        }
        if let Err(error) = self.stops.try_send(reason) {
            self.draining.store(false, Ordering::Release);
            return Err(error.into());
        }
        Ok(())
    }
    pub async fn begin_drain(&self) {
        self.accepting.store(false, Ordering::Release);
        self.draining.store(true, Ordering::Release);
        let drained = self.admission.write().await;
        drop(drained);
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
    app.accepting.store(false, Ordering::Release);
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
    if let Err(error) = app.store.state_health() {
        failures.push(format!("State ownership was lost during drain: {error:#}"));
    }
    if failures.is_empty() {
        match reason {
            StopReason::Restart(message) => app.announce_restart(message.as_deref()).await,
            StopReason::GracefulStop(message) => app.announce_stop(message.as_deref()).await,
            _ => {}
        }
        let (reply, closed) = oneshot::channel();
        if app
            .hub
            .send(HubCommand::Operations {
                command: Operation::Drained {
                    reconnect: reason.reconnect(),
                    message: reason.user_notice(),
                },
                reply,
            })
            .await
            .is_ok()
        {
            match closed.await {
                Ok(Ok(_)) => {}
                Ok(Err(error)) => failures.push(format!("Maintenance close failed: {error:#}")),
                Err(error) => failures.push(error.to_string()),
            }
        } else {
            failures.push("Hub stopped before maintenance close".into());
        }
    }
    let (reply, stopped) = oneshot::channel();
    if app.hub.send(HubCommand::Stop(reply)).await.is_ok() {
        if let Err(error) = stopped.await {
            failures.push(error.to_string());
        }
    } else {
        failures.push("Hub stopped before shutdown acknowledgement".into());
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
