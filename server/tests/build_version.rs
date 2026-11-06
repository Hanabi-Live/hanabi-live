#[allow(dead_code)]
#[path = "../build.rs"]
mod build_script;

use anyhow::{Context, Result, ensure};
use std::{
    path::{Path, PathBuf},
    process::Command,
};

struct Fixture(PathBuf);
impl Fixture {
    fn new() -> Result<Self> {
        let root = PathBuf::from(env!("CARGO_MANIFEST_DIR"))
            .join("target")
            .join(format!("version-test-{:032x}", rand::random::<u128>()));
        std::fs::create_dir_all(&root)?;
        Ok(Self(root))
    }
}
impl Drop for Fixture {
    fn drop(&mut self) {
        std::fs::remove_dir_all(&self.0).expect("remove owned version fixture");
    }
}
fn git(directory: &Path, arguments: &[&str]) -> Result<String> {
    let output = Command::new("git")
        .arg("-C")
        .arg(directory)
        .args(arguments)
        .output()?;
    ensure!(
        output.status.success(),
        "{}",
        String::from_utf8_lossy(&output.stderr)
    );
    Ok(String::from_utf8(output.stdout)?.trim().to_owned())
}
fn discover(root: &Path) -> Result<build_script::Version> {
    build_script::discover(root).map_err(anyhow::Error::msg)
}

#[test]
fn tracks_loose_packed_detached_and_worktree_heads() -> Result<()> {
    let fixture = Fixture::new()?;
    let source = PathBuf::from(env!("CARGO_MANIFEST_DIR"))
        .join("..")
        .canonicalize()?;
    let repo = fixture.0.join("checkout");
    git(
        &fixture.0,
        &[
            "clone",
            "--quiet",
            "--shared",
            "--no-checkout",
            source.to_str().context("source path")?,
            repo.to_str().context("fixture path")?,
        ],
    )?;
    let head = git(&repo, &["rev-parse", "HEAD"])?;
    // GitHub Actions checks out pull requests with a detached HEAD. Create a
    // local symbolic reference so the loose/packed branch assertions work in CI.
    git(
        &repo,
        &["symbolic-ref", "HEAD", "refs/heads/version-fixture"],
    )?;
    git(&repo, &["update-ref", "HEAD", &head])?;
    let tree = git(&repo, &["rev-parse", "HEAD^{tree}"])?;
    let alternate = git(
        &repo,
        &[
            "-c",
            "user.name=Build fixture",
            "-c",
            "user.email=build@example.invalid",
            "commit-tree",
            &tree,
            "-p",
            &head,
            "-m",
            "Disposable version fixture",
        ],
    )?;
    let reference = git(&repo, &["symbolic-ref", "HEAD"])?;
    let loose = repo.join(".git").join(&reference);
    let version = discover(&repo)?;
    assert_eq!(version.commit, head);
    assert!(version.watched.contains(&repo.join(".git/HEAD")));
    assert!(version.watched.contains(&loose));

    git(&repo, &["pack-refs", "--all", "--prune"])?;
    let packed = discover(&repo)?;
    assert!(!loose.exists());
    assert!(packed.watched.contains(&repo.join(".git/packed-refs")));
    assert!(packed.watched.iter().any(|path| loose.starts_with(path)));
    git(&repo, &["update-ref", &reference, &alternate])?;
    assert_eq!(discover(&repo)?.commit, alternate);
    assert!(discover(&repo)?.watched.contains(&loose));

    let worktree = fixture.0.join("worktree");
    git(
        &repo,
        &[
            "worktree",
            "add",
            "--quiet",
            "--no-checkout",
            worktree.to_str().context("worktree path")?,
            "-b",
            "version-worktree",
            &head,
        ],
    )?;
    let version = discover(&worktree)?;
    assert_eq!(version.commit, head);
    assert!(version.watched.contains(&worktree.join(".git")));
    assert!(
        version
            .watched
            .contains(&repo.join(".git/refs/heads/version-worktree"))
    );
    let worktree_head = PathBuf::from(git(
        &worktree,
        &["rev-parse", "--path-format=absolute", "--git-path", "HEAD"],
    )?);
    assert!(version.watched.contains(&worktree_head));

    git(
        &repo,
        &["symbolic-ref", "refs/heads/version-alias", &reference],
    )?;
    git(&repo, &["symbolic-ref", "HEAD", "refs/heads/version-alias"])?;
    let alias = discover(&repo)?;
    assert_eq!(alias.commit, alternate);
    assert!(
        alias
            .watched
            .contains(&repo.join(".git/refs/heads/version-alias"))
    );
    assert!(alias.watched.contains(&loose));
    git(
        &repo,
        &[
            "symbolic-ref",
            "refs/heads/version-alias",
            "refs/heads/version-worktree",
        ],
    )?;
    assert_eq!(discover(&repo)?.commit, head);

    git(&repo, &["update-ref", "--no-deref", "HEAD", &head])?;
    let detached = discover(&repo)?;
    assert_eq!(detached.commit, head);
    assert!(detached.watched.contains(&repo.join(".git/HEAD")));
    Ok(())
}

#[test]
fn unknown_is_reserved_for_sources_without_git_metadata() -> Result<()> {
    if !Path::new("/.git").exists() {
        assert_eq!(discover(Path::new("/"))?.commit, "unknown");
    }
    let fixture = Fixture::new()?;
    git(&fixture.0, &["init", "--quiet"])?;
    assert!(
        discover(&fixture.0).is_err(),
        "An unborn Git checkout must not silently report unknown"
    );
    Ok(())
}

#[test]
fn copied_binary_reports_its_build_commit_without_git_or_configuration() -> Result<()> {
    let fixture = Fixture::new()?;
    let copied = fixture.0.join("native-server");
    std::fs::copy(env!("CARGO_BIN_EXE_hanabi-live"), &copied)?;
    // This would fail immediately if --version attempted to load application configuration.
    std::fs::write(fixture.0.join(".env"), "not valid configuration\n")?;
    let output = Command::new(copied)
        .arg("--version")
        .current_dir(&fixture.0)
        .env_clear()
        .env("PATH", &fixture.0)
        .output()?;
    ensure!(
        output.status.success(),
        "{}",
        String::from_utf8_lossy(&output.stderr)
    );
    let commit = String::from_utf8(output.stdout)?.trim().to_owned();
    assert_eq!(commit, hanabi_live::restart::version());
    assert_eq!(
        commit,
        git(
            Path::new(env!("CARGO_MANIFEST_DIR")),
            &["rev-parse", "HEAD"]
        )?
    );
    Ok(())
}
