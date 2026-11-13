use crate::lobby::RuntimeCommand;
use chrono::{DateTime, Utc};
#[cfg(test)]
use std::sync::Arc;
use std::time::{Duration, Instant};

/// Facts about the running server that chat commands report, shared by the lobby and tables.
pub struct ServerInfo {
    base_url: String,
    came_online: DateTime<Utc>,
    started: Instant,
    quiet_restart: Option<DateTime<Utc>>,
}

impl ServerInfo {
    pub fn new(use_tls: bool, domain: &str, quiet_restart: Option<DateTime<Utc>>) -> Self {
        Self {
            base_url: format!("{}://{domain}", if use_tls { "https" } else { "http" }),
            came_online: Utc::now(),
            started: Instant::now(),
            quiet_restart,
        }
    }

    /// When the previous process restarted into this one without a reason.
    pub const fn quiet_restart(&self) -> Option<DateTime<Utc>> {
        self.quiet_restart
    }

    pub fn public_url(&self, path: &str) -> String {
        format!("{}{path}", self.base_url)
    }

    pub fn uptime(&self) -> Duration {
        self.started.elapsed()
    }

    /// The replies to the chat commands that report on the running server.
    pub fn runtime_response(&self, command: RuntimeCommand, args: &[String]) -> Vec<String> {
        match command {
            RuntimeCommand::Uptime => vec![
                format!(
                    "The server came online at: {}",
                    self.came_online.format("%a %b %d %H:%M:%S UTC %Y")
                ),
                format!(
                    "Uptime: {}",
                    crate::lifecycle::duration(self.started.elapsed().as_secs())
                ),
            ],
            RuntimeCommand::Replay => {
                if args.is_empty() {
                    vec![
                        "The format of the /replay command is: /replay [game ID] [turn number]"
                            .into(),
                    ]
                } else {
                    let mut numbers = vec![];
                    for argument in args.iter().take(2) {
                        match argument.parse::<i64>() {
                            Ok(number) => numbers.push(number),
                            Err(_) => {
                                return vec![if argument.parse::<f64>().is_ok() {
                                    "The /replay command only accepts integers.".into()
                                } else {
                                    format!("\"{argument}\" is not a number.")
                                }];
                            }
                        }
                    }
                    vec![self.public_url(&format!(
                            "/replay/{}{}",
                            numbers[0],
                            numbers
                                .get(1)
                                .map(|turn| format!("#{turn}"))
                                .unwrap_or_default()
                        ))]
                }
            }
        }
    }
}

#[cfg(test)]
pub(crate) fn test_info() -> Arc<ServerInfo> {
    Arc::new(ServerInfo::new(false, "localhost", None))
}
