use crate::{config::Config, tls};
use anyhow::{Context, Result, ensure};
use chrono::{DateTime, Utc};
use std::{
    path::{Path, PathBuf},
    process::Command,
};

pub fn validate_assets(config: &Config) -> Result<String> {
    tls::validate_static_roots(config)?;
    let client_version = std::fs::read_to_string(config.root.join("public/js/bundles/version.txt"))
        .context("Missing paired client version file")?;
    let client_version = client_version.trim();
    ensure!(
        client_version.len() == crate::git::GIT_REVISION_LENGTH
            && client_version.bytes().all(|c| c.is_ascii_hexdigit()),
        "Invalid paired client version"
    );
    ensure!(
        client_version == version(),
        "Client assets do not match the compiled server revision"
    );
    Ok(client_version.to_owned())
}

/// How long the new binary's startup check may take before a restart is abandoned.
const PREFLIGHT_TIMEOUT: std::time::Duration = std::time::Duration::from_secs(30);

pub async fn prepare(root: &Path) -> Result<()> {
    let executable = executable(root)?;
    let status = tokio::time::timeout(
        PREFLIGHT_TIMEOUT,
        tokio::process::Command::new(executable)
            .arg("--check-startup")
            .current_dir(root)
            .kill_on_drop(true)
            .status(),
    )
    .await
    .context("Restart preflight timed out")??;
    ensure!(
        status.success(),
        "Restart preflight rejected the replacement runtime"
    );
    Ok(())
}
/// Tells the replacement process when a restart without a reason began. Such a restart is
/// announced only to the development channel, so the lobby chat has no record of it.
const QUIET_RESTART_VARIABLE: &str = "HANABI_QUIET_RESTART_AT";

/// When the previous process restarted into this one without a reason.
pub fn quiet_restart() -> Option<DateTime<Utc>> {
    let value = std::env::var(QUIET_RESTART_VARIABLE).ok()?;
    DateTime::parse_from_rfc3339(&value)
        .ok()
        .map(|time| time.with_timezone(&Utc))
}

/// Replaces this process with the installed executable. A `quiet` restart has no reason.
pub fn replace(root: &Path, quiet: bool) -> Result<()> {
    use std::os::unix::process::CommandExt;
    let executable = executable(root)?;
    let mut command = Command::new(executable);
    command.current_dir(root);
    if quiet {
        command.env(QUIET_RESTART_VARIABLE, Utc::now().to_rfc3339());
    } else {
        command.env_remove(QUIET_RESTART_VARIABLE);
    }
    Err(command.exec()).context("Native process replacement failed")
}
fn executable(root: &Path) -> Result<PathBuf> {
    // Keep the original launch symlink so an atomically replaced release can be selected.
    if let Some(argument) = std::env::args_os().next() {
        let candidate = root.join(argument);
        if candidate.is_file() {
            return Ok(candidate);
        }
    }
    let current = std::env::current_exe().context("Cannot identify the executable for restart")?;
    let current = if current.is_file() {
        current
    } else {
        let text = current.to_str().context("Invalid executable path")?;
        PathBuf::from(text.strip_suffix(" (deleted)").unwrap_or(text))
    };
    ensure!(
        current.is_file(),
        "The running executable has been removed; install a replacement before restarting"
    );
    Ok(current)
}
pub fn version() -> &'static str {
    env!("HANABI_BUILD_COMMIT")
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn restart_preflight_checks_version_without_sources() -> Result<()> {
        let root = tls::fixture_root("restart")?;
        std::fs::create_dir_all(root.join("public/js/bundles"))?;
        let config = Config::from_values(
            &root,
            &[("SESSION_SECRET", "x".repeat(128))]
                .into_iter()
                .map(|(k, v)| (k.into(), v))
                .collect(),
        )?;
        assert!(validate_assets(&config).is_err());
        std::fs::write(
            root.join("public/js/bundles/version.txt"),
            format!("{}\n", version()),
        )?;
        assert_eq!(validate_assets(&config)?, version());
        for invalid in ["123", &version()[..12], &"g".repeat(40)] {
            std::fs::write(root.join("public/js/bundles/version.txt"), invalid)?;
            assert_eq!(
                validate_assets(&config).unwrap_err().to_string(),
                "Invalid paired client version"
            );
        }
        std::fs::write(root.join("public/js/bundles/version.txt"), "a".repeat(40))?;
        assert_eq!(
            validate_assets(&config).unwrap_err().to_string(),
            "Client assets do not match the compiled server revision"
        );
        std::fs::remove_dir_all(root)?;
        Ok(())
    }
}
