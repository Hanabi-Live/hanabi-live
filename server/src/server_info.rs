use anyhow::Result;
use chrono::{DateTime, Utc};
#[cfg(test)]
use std::sync::Arc;
use std::time::{Duration, Instant};

/// Facts about the running server that chat commands report, shared by the lobby and tables.
pub struct ServerInfo {
    base_url: String,
    came_online: DateTime<Utc>,
    started: Instant,
}

impl ServerInfo {
    pub fn new(use_tls: bool, domain: &str) -> Self {
        Self {
            base_url: format!("{}://{domain}", if use_tls { "https" } else { "http" }),
            came_online: Utc::now(),
            started: Instant::now(),
        }
    }

    pub fn public_url(&self, path: &str) -> String {
        format!("{}{path}", self.base_url)
    }

    pub fn uptime(&self) -> Duration {
        self.started.elapsed()
    }

    /// The replies to the chat commands that report on the running server.
    pub fn runtime_response(&self, command: &str, args: &[String]) -> Result<Vec<String>> {
        Ok(match command {
            "uptime" => vec![
                format!(
                    "The server came online at: {}",
                    self.came_online.format("%a %b %d %H:%M:%S UTC %Y")
                ),
                format!(
                    "Uptime: {}",
                    format_duration(self.started.elapsed().as_secs())
                ),
            ],
            "replay" => {
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
                                return Ok(vec![if argument.parse::<f64>().is_ok() {
                                    "The /replay command only accepts integers.".into()
                                } else {
                                    format!(
                                        "\"{}\" is not a number.",
                                        crate::accounts::escape_html(argument)
                                    )
                                }]);
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
            _ => anyhow::bail!("Invalid runtime chat command"),
        })
    }
}

fn format_duration(seconds: u64) -> String {
    let unit =
        |value: u64, name: &str| format!("{value} {name}{}", if value == 1 { "" } else { "s" });
    if seconds < 60 {
        return unit(seconds, "second");
    }
    if seconds < 3600 {
        return unit((seconds + 30) / 60, "minute");
    }
    let total_hours = seconds / 3600;
    let minutes = seconds / 60 - total_hours * 60;
    let days = (total_hours - 1) / 24;
    let hours = total_hours - days * 24;
    if days > 0 {
        format!(
            "{}, {}, and {}",
            unit(days, "day"),
            unit(hours, "hour"),
            unit(minutes, "minute")
        )
    } else {
        format!("{} and {}", unit(hours, "hour"), unit(minutes, "minute"))
    }
}

#[cfg(test)]
pub(crate) fn test_info() -> Arc<ServerInfo> {
    Arc::new(ServerInfo::new(false, "localhost"))
}
