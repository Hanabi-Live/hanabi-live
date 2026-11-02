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
        Arc, Mutex, OnceLock, Weak,
        atomic::{AtomicBool, Ordering},
    },
    time::{Duration, Instant},
};
use tokio::sync::{RwLock, mpsc, oneshot};
use tokio_util::{sync::CancellationToken, task::TaskTracker};

#[derive(Debug)]
pub enum StopReason {
    Shutdown,
    Restart,
    LeaseLost,
    Failure(String),
}
struct Schedule {
    started_at: String,
    deadline: Instant,
    empty_since: Option<Instant>,
    warned_ten: bool,
    warned_five: bool,
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
    pub maintenance: AtomicBool,
    stops: mpsc::Sender<StopReason>,
    schedule: Mutex<Option<Schedule>>,
    ordered: tokio::sync::Mutex<()>,
    cancel: CancellationToken,
    tasks: TaskTracker,
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
            maintenance: AtomicBool::new(false),
            schedule: Mutex::new(None),
            ordered: tokio::sync::Mutex::new(()),
            cancel: CancellationToken::new(),
            tasks: TaskTracker::new(),
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
        self.application
            .get()
            .and_then(Weak::upgrade)
            .map(|app| app.integration_status())
            .unwrap_or_else(|| json!({"discord":"disabled"}))
    }
    pub fn activate(self: &Arc<Self>) {
        self.accepting.store(true, Ordering::Release);
        let control = self.clone();
        self.tasks.spawn(async move {
            let mut tick = tokio::time::interval(Duration::from_secs(1));
            loop {
                tokio::select! { _=control.cancel.cancelled()=>break,_=tick.tick()=>{} }
                if let Err(error) = control.tick().await {
                    eprintln!("Scheduled shutdown failed: {error:#}");
                }
            }
        });
    }
    pub async fn operation(&self, command: Operation) -> Result<Value> {
        let (reply, received) = oneshot::channel();
        self.hub
            .send(HubCommand::Operations { command, reply })
            .await
            .context("Hub stopped")?;
        received.await.context("Hub operation was interrupted")?
    }
    pub fn time_left(&self) -> String {
        let schedule = self.schedule.lock().unwrap_or_else(|e| e.into_inner());
        match schedule.as_ref() {
            None => "The server is not scheduled to shutdown any time soon.".into(),
            Some(schedule) => format!(
                "Time left until server shutdown: {}",
                duration(
                    schedule
                        .deadline
                        .saturating_duration_since(Instant::now())
                        .as_secs()
                )
            ),
        }
    }
    pub fn metadata(&self) -> Value {
        let schedule = self.schedule.lock().unwrap_or_else(|e| e.into_inner());
        match schedule.as_ref() {
            Some(s) => json!({"shuttingDown":true,"datetimeShutdownInit":s.started_at}),
            None => json!({"shuttingDown":false}),
        }
    }
    pub async fn schedule(&self) -> Result<()> {
        let _ordered = self.ordered.lock().await;
        ensure!(
            self.accepting.load(Ordering::Acquire),
            "The server is not ready for lifecycle operations."
        );
        {
            let mut schedule = self.schedule.lock().unwrap_or_else(|e| e.into_inner());
            ensure!(
                schedule.is_none() && !self.draining.load(Ordering::Acquire),
                "The server is already shutting down."
            );
            *schedule = Some(Schedule {
                started_at: chrono::Utc::now().to_rfc3339(),
                deadline: Instant::now() + Duration::from_secs(1800),
                empty_since: None,
                warned_ten: false,
                warned_five: false,
            });
        }
        let started_at = self.metadata()["datetimeShutdownInit"]
            .as_str()
            .map(str::to_owned);
        if let Err(error) = self
            .operation(Operation::Shutdown {
                scheduled: true,
                started_at,
                imminent: false,
            })
            .await
        {
            *self.schedule.lock().unwrap_or_else(|e| e.into_inner()) = None;
            return Err(error);
        }
        self.notice("The server will shutdown in 30 minutes.")
            .await?;
        if self.active_games().await? == 0 {
            self.request_stop(false).await?;
        }
        Ok(())
    }
    pub async fn cancel_schedule(&self) -> Result<()> {
        let _ordered = self.ordered.lock().await;
        ensure!(
            !self.draining.load(Ordering::Acquire),
            "The server is already draining."
        );
        ensure!(
            self.schedule
                .lock()
                .unwrap_or_else(|e| e.into_inner())
                .is_some(),
            "The server is not awaiting shutdown, so you cannot cancel it."
        );
        self.operation(Operation::Shutdown {
            scheduled: false,
            started_at: None,
            imminent: false,
        })
        .await?;
        *self.schedule.lock().unwrap_or_else(|e| e.into_inner()) = None;
        self.notice("Server shutdown has been canceled.").await?;
        Ok(())
    }
    pub async fn request_stop(&self, restart: bool) -> Result<()> {
        ensure!(
            self.accepting.load(Ordering::Acquire),
            "The server is not ready for lifecycle operations."
        );
        ensure!(
            !self.draining.swap(true, Ordering::AcqRel),
            "The server is already draining."
        );
        if restart && let Err(error) = crate::restart::prepare(&self.root).await {
            self.draining.store(false, Ordering::Release);
            return Err(error);
        }
        if let Err(error) = self.stops.try_send(if restart {
            StopReason::Restart
        } else {
            StopReason::Shutdown
        }) {
            self.draining.store(false, Ordering::Release);
            return Err(error.into());
        }
        Ok(())
    }
    pub async fn notice(&self, message: &str) -> Result<()> {
        self.operation(Operation::Broadcast {
            message: message.into(),
        })
        .await?;
        Ok(())
    }
    pub async fn set_maintenance(&self, enabled: bool) -> Result<bool> {
        let _ordered = self.ordered.lock().await;
        if self.maintenance.load(Ordering::Acquire) == enabled {
            return Ok(false);
        }
        self.operation(Operation::Maintenance { enabled }).await?;
        self.maintenance.store(enabled, Ordering::Release);
        self.notice(if enabled {
            "The server is entering maintenance mode. New game creation has been disabled."
        } else {
            "Server maintenance is complete. New game creation has been enabled."
        })
        .await?;
        Ok(true)
    }
    async fn active_games(&self) -> Result<u64> {
        self.operation(Operation::Inspect).await?["activeGames"]
            .as_u64()
            .context("Hub did not report active game count")
    }
    async fn tick(&self) -> Result<()> {
        if !self.accepting.load(Ordering::Acquire) || self.draining.load(Ordering::Acquire) {
            return Ok(());
        }
        let _admitted = self.admission.read().await;
        if !self.accepting.load(Ordering::Acquire) {
            return Ok(());
        }
        let _ordered = self.ordered.lock().await;
        if self
            .schedule
            .lock()
            .unwrap_or_else(|e| e.into_inner())
            .is_none()
        {
            return Ok(());
        }
        let active = self.active_games().await?;
        let (ten, five, expired, stop, started_at) = {
            let mut schedule = self.schedule.lock().unwrap_or_else(|e| e.into_inner());
            let Some(s) = schedule.as_mut() else {
                return Ok(());
            };
            let now = Instant::now();
            let left = s.deadline.saturating_duration_since(now);
            let ten = !s.warned_ten && left <= Duration::from_secs(600);
            let five = !s.warned_five && left <= Duration::from_secs(300);
            s.warned_ten |= ten;
            s.warned_five |= five;
            if active == 0 {
                s.empty_since.get_or_insert(now);
            } else {
                s.empty_since = None;
            }
            (
                ten,
                five,
                now >= s.deadline,
                s.empty_since
                    .is_some_and(|empty| now.duration_since(empty) >= Duration::from_secs(10)),
                s.started_at.clone(),
            )
        };
        if ten {
            self.notice("The server will shutdown in 10 minutes. Finish your game soon or it will be automatically terminated!").await?;
        }
        if five {
            self.operation(Operation::Shutdown {
                scheduled: true,
                started_at: Some(started_at),
                imminent: true,
            })
            .await?;
            self.operation(Operation::ClearPregames).await?;
            self.notice("The server will shutdown in 5 minutes. Finish your game soon or it will be automatically terminated!").await?;
        }
        if expired && active > 0 {
            self.operation(Operation::TerminateGames).await?;
        }
        if stop {
            self.request_stop(false).await?;
        }
        Ok(())
    }
    pub async fn begin_drain(&self) {
        self.accepting.store(false, Ordering::Release);
        self.draining.store(true, Ordering::Release);
        self.cancel.cancel();
        let drained = self.admission.write().await;
        drop(drained);
        self.tasks.close();
        self.tasks.wait().await;
    }
}
impl crate::web::RuntimeStatus for Control {
    fn time_left(&self) -> String {
        self.time_left()
    }
    fn shutting_down(&self) -> bool {
        self.schedule
            .lock()
            .unwrap_or_else(|e| e.into_inner())
            .is_some()
    }
    fn maintenance_mode(&self) -> bool {
        self.maintenance.load(Ordering::Acquire)
    }
    fn shutdown_started_at(&self) -> Option<String> {
        self.schedule
            .lock()
            .unwrap_or_else(|e| e.into_inner())
            .as_ref()
            .map(|schedule| schedule.started_at.clone())
    }
}

pub fn duration(seconds: u64) -> String {
    let unit = |n, label| format!("{n} {label}{}", if n == 1 { "" } else { "s" });
    if seconds < 60 {
        return unit(seconds, "second");
    }
    if seconds < 3600 {
        return unit((seconds + 30) / 60, "minute");
    }
    let total = seconds / 3600;
    let days = total.saturating_sub(1) / 24;
    let hours = total - days * 24;
    let minutes = seconds / 60 - total * 60;
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

pub async fn drain_game_runtime(app: &App, tables: &TaskTracker) -> Result<()> {
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
        let (reply, closed) = oneshot::channel();
        if app
            .hub
            .send(HubCommand::Operations {
                command: Operation::Drained,
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
            failures.push(error.to_string())
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
