use crate::{config::Config, tls};
use anyhow::{Context, Result, ensure};
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
        client_version.len() == 40 && client_version.bytes().all(|c| c.is_ascii_hexdigit()),
        "Invalid paired client version"
    );
    ensure!(
        client_version == version(),
        "Client assets do not match the compiled server revision"
    );
    Ok(client_version.to_owned())
}

pub async fn prepare(root: &Path) -> Result<()> {
    let executable = executable(root)?;
    let status = tokio::time::timeout(
        std::time::Duration::from_secs(30),
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
pub fn replace(root: &Path) -> Result<()> {
    use std::os::unix::process::CommandExt;
    let executable = executable(root)?;
    Err(Command::new(executable).current_dir(root).exec())
        .context("Native process replacement failed")
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
        let root = crate::tls::fixture_root("restart")?;
        std::fs::create_dir_all(root.join("public/js/bundles"))?;
        let config = Config::from_values(
            &root,
            &[
                ("SESSION_SECRET", "x".repeat(128)),
                ("REDIS_URL", "redis://localhost".into()),
            ]
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
