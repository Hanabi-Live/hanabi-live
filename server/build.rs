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
        if commit.len() != 40
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
    if !matches!(commit.len(), 40 | 64) || !commit.bytes().all(|byte| byte.is_ascii_hexdigit()) {
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

/// The server requires the schema version that the migrations directory produces, so adding a
/// migration updates it without a hand-kept constant.
fn write_schema_version(root: &Path) {
    let install = root.join("../install");
    let script = install.join("migration-files.sh");
    let migrations = install.join("migrations");
    println!("cargo:rerun-if-changed={}", script.display());
    println!("cargo:rerun-if-changed={}", migrations.display());
    let output = Command::new("bash")
        .arg(&script)
        .arg(&migrations)
        .output()
        .expect("Unable to run install/migration-files.sh");
    assert!(
        output.status.success(),
        "Invalid database migrations: {}",
        String::from_utf8_lossy(&output.stderr).trim()
    );
    let version: i32 = String::from_utf8_lossy(&output.stdout)
        .trim()
        .parse()
        .expect("install/migration-files.sh printed an invalid schema version");
    let out = PathBuf::from(env::var_os("OUT_DIR").expect("Cargo output directory"));
    std::fs::write(
        out.join("schema_version.rs"),
        format!("pub const SCHEMA_VERSION: i32 = {version};\n"),
    )
    .expect("Unable to write the schema version");
}
