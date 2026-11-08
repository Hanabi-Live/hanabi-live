#[path = "src/git.rs"]
mod git;

use git::GIT_REVISION_LENGTH;
use std::{
    collections::BTreeSet,
    env,
    path::{Path, PathBuf},
    process::{Command, Output},
};

pub struct Version {
    pub commit: String,
    pub watched: BTreeSet<PathBuf>,
}

fn git(root: &Path, arguments: &[&str]) -> std::io::Result<Output> {
    let mut command = Command::new("git");
    command.arg("-C").arg(root).args(arguments);
    for key in [
        "GIT_DIR",
        "GIT_WORK_TREE",
        "GIT_COMMON_DIR",
        "GIT_INDEX_FILE",
        "GIT_OBJECT_DIRECTORY",
        "GIT_ALTERNATE_OBJECT_DIRECTORIES",
        "GIT_CEILING_DIRECTORIES",
    ] {
        command.env_remove(key);
    }
    command.output()
}

fn checked(root: &Path, arguments: &[&str]) -> Result<String, String> {
    let output = git(root, arguments).map_err(|error| error.to_string())?;
    if !output.status.success() {
        return Err(format!(
            "git {} failed: {}",
            arguments.join(" "),
            String::from_utf8_lossy(&output.stderr).trim()
        ));
    }
    String::from_utf8(output.stdout)
        .map(|value| value.trim().to_owned())
        .map_err(|error| error.to_string())
}

fn git_path(root: &Path, name: &str) -> Result<PathBuf, String> {
    checked(
        root,
        &["rev-parse", "--path-format=absolute", "--git-path", name],
    )
    .map(PathBuf::from)
}

pub fn discover(root: &Path, supplied_revision: Option<&str>) -> Result<Version, String> {
    if let Some(commit) = supplied_revision {
        if commit.len() != GIT_REVISION_LENGTH
            || !commit
                .bytes()
                .all(|byte| byte.is_ascii_digit() || (b'a'..=b'f').contains(&byte))
        {
            return Err("HANABI_BUILD_REVISION must be a full lowercase Git SHA".into());
        }
        return Ok(Version {
            commit: commit.into(),
            watched: BTreeSet::new(),
        });
    }
    let marker = root
        .ancestors()
        .map(|parent| parent.join(".git"))
        .find(|path| path.exists());
    let directory = checked(root, &["rev-parse", "--absolute-git-dir"]);
    let directory = match directory {
        Ok(directory) => PathBuf::from(directory),
        Err(_) if marker.is_none() => {
            return Ok(Version {
                commit: "unknown".into(),
                watched: BTreeSet::new(),
            });
        }
        Err(error) => return Err(error),
    };
    let commit = checked(root, &["rev-parse", "--verify", "HEAD^{commit}"])?;
    if commit.len() != GIT_REVISION_LENGTH || !commit.bytes().all(|byte| byte.is_ascii_hexdigit()) {
        return Err("Git returned an invalid commit identifier".into());
    }
    let mut watched = BTreeSet::from([git_path(root, "HEAD")?]);
    if let Some(marker) = marker.filter(|path| path.is_file()) {
        watched.insert(marker);
    }
    if directory.join("commondir").is_file() {
        watched.insert(directory.join("commondir"));
    }
    let mut name = "HEAD".to_owned();
    let mut seen = BTreeSet::new();
    loop {
        let symbolic = git(root, &["symbolic-ref", "--quiet", "--no-recurse", &name])
            .map_err(|error| error.to_string())?;
        if symbolic.status.code() == Some(1) {
            break;
        }
        if !symbolic.status.success() {
            return Err("Unable to resolve the symbolic Git HEAD".into());
        }
        let target = String::from_utf8(symbolic.stdout).map_err(|error| error.to_string())?;
        let reference = git_path(root, target.trim())?;
        // A packed branch has no loose file yet. Watch its existing parent for creation,
        // rather than registering a nonexistent path that makes every Cargo run dirty.
        let existing = reference
            .ancestors()
            .find(|path| path.exists())
            .ok_or("Git reference has no existing parent")?;
        watched.insert(existing.to_path_buf());
        let packed = git_path(root, "packed-refs")?;
        if packed.is_file() {
            watched.insert(packed);
        }
        if !seen.insert(target.trim().to_owned()) {
            return Err("Cyclic symbolic Git reference".into());
        }
        // Continue through symbolic branch aliases as well as HEAD itself.
        target.trim().clone_into(&mut name);
    }
    Ok(Version { commit, watched })
}

fn main() {
    println!("cargo:rerun-if-changed=build.rs");
    println!("cargo:rerun-if-changed=src/git.rs");
    println!("cargo:rerun-if-env-changed=HANABI_BUILD_REVISION");
    let root = PathBuf::from(env::var_os("CARGO_MANIFEST_DIR").expect("Cargo manifest directory"));
    let supplied_revision = env::var_os("HANABI_BUILD_REVISION");
    let supplied_revision = supplied_revision
        .as_deref()
        .map(|value| value.to_str().expect("Invalid build revision encoding"));
    let version =
        discover(&root, supplied_revision).expect("Unable to determine the compiled server commit");
    for path in version.watched {
        println!("cargo:rerun-if-changed={}", path.display());
    }
    println!("cargo:rustc-env=HANABI_BUILD_COMMIT={}", version.commit);
    write_schema_version(&root);
}

/// Largest number of digits in a migration version.
const MAX_VERSION_DIGITS: usize = 9;
/// Fewest digits in a migration file's version prefix, so that files sort by name.
const MIN_FILE_VERSION_DIGITS: usize = 3;

/// Parses a version of at most `MAX_VERSION_DIGITS` digits without leading zeros.
fn parse_baseline(text: &str) -> Option<i64> {
    let digits = !text.is_empty()
        && text.len() <= MAX_VERSION_DIGITS
        && text.bytes().all(|byte| byte.is_ascii_digit());
    let canonical = text == "0" || !text.starts_with('0');
    if !(digits && canonical) {
        return None;
    }
    text.parse().ok()
}

/// Returns the version of a file named like `017_add_column.sql`.
fn migration_number(name: &str) -> Option<i64> {
    let (number, description) = name.split_once('_')?;
    let description = description.strip_suffix(".sql")?;
    let valid = (MIN_FILE_VERSION_DIGITS..=MAX_VERSION_DIGITS).contains(&number.len())
        && number.bytes().all(|byte| byte.is_ascii_digit())
        && !description.is_empty()
        && description
            .bytes()
            .all(|byte| byte.is_ascii_lowercase() || byte.is_ascii_digit() || byte == b'_');
    if !valid {
        return None;
    }
    number.parse().ok()
}

/// Validates `install/migrations` and records its baseline and resulting schema version, so that
/// adding a migration updates the version the server requires without a hand-kept constant.
fn write_schema_version(root: &Path) {
    let migrations = root.join("../install/migrations");
    println!("cargo:rerun-if-changed={}", migrations.display());
    let baseline_text = std::fs::read_to_string(migrations.join("baseline.txt"))
        .expect("Unable to read install/migrations/baseline.txt");
    let baseline = parse_baseline(baseline_text.trim()).expect("Invalid migration baseline");
    let mut versions = Vec::new();
    for entry in std::fs::read_dir(&migrations).expect("Unable to read install/migrations") {
        let entry = entry.expect("Unable to read install/migrations");
        let name = entry
            .file_name()
            .into_string()
            .expect("Invalid migration file name");
        // SQLx ignores other files, such as `baseline.txt`.
        if entry
            .path()
            .extension()
            .is_none_or(|extension| extension != "sql")
        {
            continue;
        }
        let file = entry
            .file_type()
            .expect("Unable to read install/migrations");
        let version = migration_number(&name)
            .filter(|_| file.is_file())
            .unwrap_or_else(|| panic!("Invalid migration file: {name}"));
        versions.push((version, name));
    }
    versions.sort();
    let mut version = baseline;
    for (number, name) in versions {
        assert!(
            number == version + 1,
            "Migration numbers must be unique and consecutive after the baseline: {name}"
        );
        version = number;
    }
    let out = PathBuf::from(env::var_os("OUT_DIR").expect("Cargo output directory"));
    std::fs::write(
        out.join("schema_version.rs"),
        format!(
            "/// The version that `install/migrations/baseline.txt` records.\n\
             pub const BASELINE: i64 = {baseline};\n\
             /// The version that the migrations in `install/migrations` produce.\n\
             pub const SCHEMA_VERSION: i64 = {version};\n"
        ),
    )
    .expect("Unable to write the schema version");
}
