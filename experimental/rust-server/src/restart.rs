use crate::{config::Config, tls};
use anyhow::{Context, Result, ensure};
use std::{
    path::{Path, PathBuf},
    process::Command,
};

pub fn validate_assets(config: &Config) -> Result<String> {
    tls::validate_static_roots(config)?;
    let version = std::fs::read_to_string(config.root.join("public/js/bundles/version.txt"))
        .context("Missing paired client version file")?;
    let version = version.trim();
    ensure!(
        !version.is_empty()
            && version.bytes().all(|c| c.is_ascii_digit())
            && version
                .parse::<u64>()
                .is_ok_and(|v| v <= 9_007_199_254_740_991),
        "Invalid paired client version"
    );
    let words = std::fs::read_to_string(config.root.join("misc/word_list.txt"))
        .context("Missing game-name dictionary")?;
    let distinct: std::collections::HashSet<_> = words
        .lines()
        .map(str::trim)
        .filter(|word| !word.is_empty())
        .collect();
    ensure!(distinct.len() >= 3, "Dictionary has too few distinct words");
    Ok(version.to_owned())
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
    fn restart_preflight_checks_version_and_dictionary_without_sources() -> Result<()> {
        let root = crate::tls::fixture_root("restart")?;
        std::fs::create_dir_all(root.join("public/js/bundles"))?;
        std::fs::create_dir(root.join("misc"))?;
        let config = Config::from_values(
            root.clone(),
            [
                ("SESSION_SECRET", "x".repeat(128)),
                ("REDIS_URL", "redis://localhost".into()),
            ]
            .into_iter()
            .map(|(k, v)| (k.into(), v))
            .collect(),
        )?;
        std::fs::write(root.join("public/js/bundles/version.txt"), "123\n")?;
        assert!(validate_assets(&config).is_err());
        std::fs::write(root.join("misc/word_list.txt"), "one\ntwo\nthree\n")?;
        assert_eq!(validate_assets(&config)?, "123");
        std::fs::write(
            root.join("public/js/bundles/version.txt"),
            "9007199254740992",
        )?;
        assert!(validate_assets(&config).is_err());
        std::fs::remove_dir_all(root)?;
        Ok(())
    }
}
