//! Optional integrations are injected, bounded and disabled without configuration.
pub mod alerts;
pub mod discord;
#[cfg(test)]
mod discord_tests;

use crate::{actors::HubCommand, lifecycle::Lifecycle, server_info::ServerInfo};
use anyhow::Result;
use sqlx::PgPool;
use std::{collections::HashMap, sync::Arc, time::Duration};
use tokio::sync::mpsc;
use tokio_util::task::TaskTracker;

/// How long a restart or stop waits for its Discord announcement.
const ANNOUNCEMENT_TIMEOUT: Duration = Duration::from_secs(5);

/// The integrations once they start, which happens after the server starts listening.
pub type IntegrationSlot = Arc<std::sync::OnceLock<Arc<Integrations>>>;

/// The parts of the running server that the integrations use.
#[derive(Clone)]
pub struct Server {
    pub hub: mpsc::Sender<HubCommand>,
    /// The primary database pool.
    pub pool: PgPool,
    pub lifecycle: Arc<Lifecycle>,
    pub info: Arc<ServerInfo>,
    /// Runs the integrations' tasks until the server shuts down.
    pub background: TaskTracker,
    pub development: bool,
    /// The client version, which alerts name as the release.
    pub release: String,
}

pub struct Integrations {
    discord: Option<Arc<discord::Bridge>>,
    discord_failed: bool,
    alerts: Arc<alerts::Alerts>,
}

impl Integrations {
    pub async fn start(server: Server, values: &HashMap<String, String>) -> Result<Arc<Self>> {
        let discord = match discord::Configuration::read(values) {
            Ok(Some(config)) => match discord::Bridge::start(server.clone(), config, None).await {
                Ok(bridge) => Some(bridge),
                Err(error) => {
                    crate::errors::Report::from_error("Initializing Discord", &error).log();
                    None
                }
            },
            Ok(None) => None,
            Err(error) => {
                crate::errors::Report::from_error("Configuring Discord", &error).log();
                None
            }
        };
        let discord_failed = discord.is_none()
            && values
                .iter()
                .any(|(key, value)| key.starts_with("DISCORD_") && !value.trim().is_empty());
        let alerts = alerts::Alerts::start(
            discord.clone(),
            server.development,
            server.release.clone(),
            &server.background,
            server.lifecycle.shutdown.clone(),
        );
        if let Some(bridge) = &discord {
            bridge.listen(alerts.clone());
        }
        Ok(Arc::new(Self {
            discord,
            discord_failed,
            alerts,
        }))
    }

    pub fn report(&self, report: &crate::errors::Report) {
        self.alerts.report(report);
    }

    /// The Discord bridge's status.
    pub fn discord_status(&self) -> &'static str {
        self.discord.as_ref().map_or(
            if self.discord_failed {
                "degraded"
            } else {
                "disabled"
            },
            |bridge| bridge.status(),
        )
    }

    pub async fn mirror(&self, chat_id: i32, raw: Option<&str>) {
        if let Some(bridge) = &self.discord
            && let Err(error) = bridge.mirror(chat_id, raw).await
        {
            bridge.degrade();
            let report = crate::errors::Report::from_error("Sending Discord message", &error);
            report.log();
            self.alerts.report(&report);
        }
    }

    pub async fn announce_restart(&self, uptime: Duration, message: Option<&str>) {
        self.announce_shutdown(uptime, false, message).await;
    }

    pub async fn announce_stop(&self, uptime: Duration, message: Option<&str>) {
        self.announce_shutdown(uptime, true, message).await;
    }

    async fn announce_shutdown(
        &self,
        uptime: Duration,
        graceful_stop: bool,
        message: Option<&str>,
    ) {
        if let Some(bridge) = &self.discord {
            let announcement = async {
                if graceful_stop {
                    bridge.announce_stop(uptime, message).await
                } else {
                    bridge.announce_restart(uptime, message).await
                }
            };
            // An optional notification must not prevent a safely checkpointed stop.
            match tokio::time::timeout(ANNOUNCEMENT_TIMEOUT, announcement).await {
                Ok(Ok(())) => {}
                result => {
                    bridge.degrade();
                    let error = match result {
                        Err(_) => crate::errors::Fault::new("discord_announcement_timeout",
                            format!("Discord lifecycle announcement exceeded {} seconds; continuing the drained shutdown.", ANNOUNCEMENT_TIMEOUT.as_secs()),
                            axum::http::StatusCode::GATEWAY_TIMEOUT).into(),
                        Ok(Err(error)) => error,
                        Ok(Ok(())) => unreachable!(),
                    };
                    let report = crate::errors::Report::from_error(
                        if graceful_stop {
                            "Announcing graceful stop to Discord"
                        } else {
                            "Announcing restart to Discord"
                        },
                        &error,
                    );
                    report.log();
                    self.alerts.report(&report);
                }
            }
        }
    }

    pub async fn render(&self, text: &str) -> String {
        match &self.discord {
            Some(bridge) => bridge.render(text).await,
            None => crate::accounts::escape_html(text),
        }
    }
}
