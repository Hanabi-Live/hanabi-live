//! Optional integrations are injected, bounded and disabled without configuration.
pub mod discord;
#[cfg(test)]
mod discord_tests;
pub mod telemetry;

use crate::web::App;
use anyhow::Result;
use std::{collections::HashMap, sync::Arc, time::Duration};

pub struct Integrations {
    discord: Option<Arc<discord::Bridge>>,
    discord_failed: bool,
    telemetry: Arc<telemetry::Telemetry>,
}

impl Integrations {
    pub async fn start(app: Arc<App>, values: &HashMap<String, String>) -> Result<Arc<Self>> {
        let telemetry = telemetry::Telemetry::start(
            values.get("SENTRY_DSN").map(String::as_str).unwrap_or(""),
            app.is_development(),
            app.version.clone(),
            &app.background,
            app.shutdown.clone(),
        )?;
        if values.get("GA_TRACKING_ID").is_some_and(|s| !s.is_empty()) {
            eprintln!("GA_TRACKING_ID targets retired Universal Analytics and is not used.");
        }
        let discord = match discord::Configuration::read(values) {
            Ok(Some(config)) => match discord::Bridge::start(app.clone(), config, None).await {
                Ok(bridge) => Some(bridge),
                Err(error) => {
                    crate::errors::Report::from_error("Initializing Discord", &error, None).log();
                    None
                }
            },
            Ok(None) => None,
            Err(error) => {
                crate::errors::Report::from_error("Configuring Discord", &error, None).log();
                None
            }
        };
        let discord_failed = discord.is_none()
            && values
                .iter()
                .any(|(key, value)| key.starts_with("DISCORD_") && !value.trim().is_empty());
        Ok(Arc::new(Self {
            discord,
            discord_failed,
            telemetry,
        }))
    }

    pub fn report(&self, report: &crate::errors::Report) {
        self.telemetry.report(report);
    }

    pub fn status(&self) -> serde_json::Value {
        serde_json::json!({"discord":self.discord.as_ref().map(|bridge|bridge.status()).unwrap_or(if self.discord_failed {"degraded"} else {"disabled"})})
    }

    pub async fn mirror(&self, chat_id: i32, raw: Option<&str>) {
        if let Some(bridge) = &self.discord
            && let Err(error) = bridge.mirror(chat_id, raw).await
        {
            bridge.degrade();
            let report = crate::errors::Report::from_error("Sending Discord message", &error, None);
            report.log();
            self.telemetry.report(&report);
        }
    }

    pub async fn announce_restart(&self, uptime: Duration) {
        if let Some(bridge) = &self.discord {
            // An optional notification must not prevent a safely checkpointed restart.
            match tokio::time::timeout(Duration::from_millis(250), bridge.announce_restart(uptime))
                .await
            {
                Ok(Ok(())) => {}
                result => {
                    bridge.degrade();
                    let error = match result {
                        Err(_) => crate::errors::Fault::new("discord_announcement_timeout",
                            "Discord restart announcement exceeded 250 milliseconds; continuing the drained restart.",
                            axum::http::StatusCode::GATEWAY_TIMEOUT).into(),
                        Ok(Err(error)) => error,
                        Ok(Ok(())) => unreachable!(),
                    };
                    let report = crate::errors::Report::from_error(
                        "Announcing restart to Discord",
                        &error,
                        None,
                    );
                    report.log();
                    self.telemetry.report(&report);
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
