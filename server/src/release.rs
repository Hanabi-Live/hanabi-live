use anyhow::{Context, Result, bail, ensure};
use serde::Deserialize;
use sha2::{Digest, Sha256};
use sqlx::{
    Connection,
    postgres::{PgConnectOptions, PgConnection, PgSslMode},
};
use std::os::unix::fs::OpenOptionsExt;
use std::{
    collections::BTreeMap,
    fs::{File, OpenOptions},
    io::Read,
    path::{Component, Path, PathBuf},
};

const RUNTIME_FILES: &[&str] = &[".env", "logs", "motd.txt", "letsencrypt", ".lifecycle.lock"];

#[derive(Clone, Copy)]
pub enum Mode {
    Run,
    Inspect,
}

#[derive(Deserialize)]
struct Manifest {
    format: u32,
    platform: String,
    revision: String,
    #[serde(rename = "clientVersion")]
    client_version: String,
    files: BTreeMap<String, String>,
}

fn safe_path(name: &str) -> bool {
    !name.is_empty()
        && !name.contains('\\')
        && Path::new(name)
            .components()
            .all(|part| matches!(part, Component::Normal(_)))
}

fn private_path(name: &str) -> bool {
    name.split('/').any(|part| {
        part == ".git"
            || part == ".env"
            || part.starts_with(".env.")
            || matches!(part, "logs" | "GitHub_private_key.pem")
    })
}

fn hash_file(path: &Path) -> Result<String> {
    let mut file = File::open(path)?;
    let mut digest = Sha256::new();
    let mut buffer = vec![0; 65536];
    loop {
        let size = file.read(&mut buffer)?;
        if size == 0 {
            break;
        }
        digest.update(&buffer[..size]);
    }
    Ok(hex::encode(digest.finalize()))
}

fn inventory(root: &Path, directory: &Path, files: &mut BTreeMap<String, String>) -> Result<()> {
    for entry in std::fs::read_dir(directory)? {
        let entry = entry?;
        let path = entry.path();
        let relative = path
            .strip_prefix(root)?
            .to_str()
            .context("Invalid release filename")?
            .to_owned();
        if RUNTIME_FILES.contains(&relative.as_str()) || relative == "release.json" {
            continue;
        }
        ensure!(
            !private_path(&relative),
            "Private/runtime data included in immutable release assets"
        );
        let kind = entry.file_type()?;
        ensure!(
            !kind.is_symlink(),
            "Immutable release assets must not be symlinks"
        );
        if kind.is_dir() {
            inventory(root, &path, files)?;
        } else {
            ensure!(kind.is_file(), "Invalid immutable release asset");
            files.insert(relative, hash_file(&path)?);
        }
    }
    Ok(())
}

pub fn verify(root: &Path) -> Result<()> {
    let path = root.join("release.json");
    ensure!(
        std::fs::symlink_metadata(&path)?.is_file(),
        "Release manifest is not a regular file"
    );
    let manifest: Manifest = serde_json::from_slice(&std::fs::read(path)?)?;
    ensure!(
        manifest.format == 2 && manifest.platform == "linux-amd64",
        "Unsupported native release"
    );
    ensure!(
        manifest.revision == crate::restart::version()
            && manifest.revision.len() == crate::restart::REVISION_LENGTH,
        "Release does not match the compiled Rust revision"
    );
    ensure!(
        manifest.client_version == manifest.revision,
        "Invalid client version"
    );
    ensure!(
        manifest.files.keys().all(|name| safe_path(name)),
        "Unsafe release path"
    );
    for required in [
        "hanabi-live",
        "install/tern",
        "install/migrate.sh",
        "install/migration-files.sh",
        "public/js/bundles/version.txt",
        "public/js/bundles/git_revision.txt",
    ] {
        ensure!(
            manifest.files.contains_key(required),
            "Missing release asset: {required}"
        );
    }
    for required in [
        format!("public/js/bundles/main.{}.min.js", manifest.client_version),
        format!("public/css/main.{}.min.css", manifest.client_version),
    ] {
        ensure!(
            manifest.files.contains_key(&required),
            "Missing paired client bundle: {required}"
        );
    }
    let mut actual = BTreeMap::new();
    inventory(root, root, &mut actual)?;
    ensure!(
        actual == manifest.files,
        "Release assets do not match the verified manifest"
    );
    for (name, expected) in [
        ("version.txt", manifest.client_version),
        ("git_revision.txt", manifest.revision),
    ] {
        ensure!(
            std::fs::read_to_string(root.join("public/js/bundles").join(name))?.trim() == expected,
            "Client/server version mismatch"
        );
    }
    Ok(())
}

pub fn enter(mode: Mode) -> Result<Option<File>> {
    let executable = std::env::current_exe()?;
    let root = executable
        .parent()
        .context("Missing executable directory")?
        .canonicalize()?;
    match std::fs::symlink_metadata(root.join("release.json")) {
        Err(error) if error.kind() == std::io::ErrorKind::NotFound => return Ok(None),
        Err(error) => return Err(error.into()),
        Ok(_) => {}
    }
    verify(&root)?;
    std::env::set_current_dir(&root)?;
    if matches!(mode, Mode::Inspect) {
        return Ok(None);
    }
    let path = root.join(".lifecycle.lock");
    let file = OpenOptions::new()
        .read(true)
        .write(true)
        .create(true)
        .mode(0o600)
        .truncate(false)
        .open(&path)?;
    file.try_lock()
        .context("Release is running or activation is in progress")?;
    if matches!(mode, Mode::Run) && std::fs::symlink_metadata(path)?.file_type().is_symlink() {
        let current = root.join("../../current").canonicalize()?;
        ensure!(
            current == root,
            "This installed release is no longer current"
        );
    }
    Ok(Some(file))
}

pub async fn check_migration_target() -> Result<()> {
    let root: PathBuf = std::env::current_exe()?
        .parent()
        .context("Missing executable directory")?
        .into();
    let output = std::process::Command::new("bash")
        .arg(root.join("install/migration-files.sh"))
        .arg(root.join("install/migrations"))
        .output()?;
    ensure!(output.status.success(), "Invalid release migration files");
    let target: i32 = std::str::from_utf8(&output.stdout)?.trim().parse()?;
    let baseline: i32 = std::fs::read_to_string(root.join("install/migrations/baseline.txt"))?
        .trim()
        .parse()?;
    let field =
        |name| std::env::var(name).with_context(|| format!("Migration runner must supply {name}"));
    let options = PgConnectOptions::new()
        .host(&field("PGHOST")?)
        .port(field("PGPORT")?.parse()?)
        .username(&field("PGUSER")?)
        .password(&field("PGPASSWORD")?)
        .database(&field("PGDATABASE")?)
        .ssl_mode(PgSslMode::Disable);
    let mut connection = PgConnection::connect_with(&options).await?;
    let exists: bool = sqlx::query_scalar!(
        "SELECT to_regclass('public.schema_version') IS NOT NULL AS \"value!\""
    )
    .fetch_one(&mut connection)
    .await?;
    if exists {
        let row =
            sqlx::query!("SELECT COALESCE(MIN(version),-1) AS \"version!\",count(*) AS \"count!\" FROM schema_version")
                .fetch_one(&mut connection)
                .await?;
        ensure!(
            row.count == 1 && row.version >= baseline && row.version <= target,
            "Database schema is outside the supported migration range"
        );
    } else {
        bail!(
            "Missing schema version; initialize a fresh database or upgrade with an earlier release"
        );
    }
    connection.close().await?;
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;
    use serde_json::json;

    #[test]
    fn verify_requires_paired_sha_assets() {
        let root = std::env::temp_dir().join(format!(
            "hanabi-sha-release-{:032x}",
            rand::random::<u128>()
        ));
        let revision = crate::restart::version();
        for (name, value) in [
            ("hanabi-live".into(), "binary"),
            ("install/tern".into(), "migration tool"),
            ("install/migrate.sh".into(), "migration runner"),
            ("install/migration-files.sh".into(), "migration helper"),
            ("public/js/bundles/version.txt".into(), revision),
            ("public/js/bundles/git_revision.txt".into(), revision),
            (format!("public/js/bundles/main.{revision}.min.js"), "js"),
            (format!("public/css/main.{revision}.min.css"), "css"),
        ] {
            let path = root.join(name);
            std::fs::create_dir_all(path.parent().unwrap()).unwrap();
            std::fs::write(path, value).unwrap();
        }
        let mut files = BTreeMap::new();
        inventory(&root, &root, &mut files).unwrap();
        let mut manifest = json!({
            "format": 2,
            "platform": "linux-amd64",
            "revision": revision,
            "clientVersion": revision,
            "files": files,
        });
        let write_manifest = |manifest: &serde_json::Value| {
            std::fs::write(root.join("release.json"), manifest.to_string()).unwrap();
        };
        write_manifest(&manifest);
        assert!(verify(&root).is_ok());
        for version in ["42", &revision[..12], &"a".repeat(40)] {
            manifest["clientVersion"] = json!(version);
            write_manifest(&manifest);
            assert_eq!(
                verify(&root).unwrap_err().to_string(),
                "Invalid client version"
            );
        }
        manifest["clientVersion"] = json!(revision);
        std::fs::write(root.join("public/js/bundles/version.txt"), "42").unwrap();
        manifest["files"]["public/js/bundles/version.txt"] =
            json!(hash_file(&root.join("public/js/bundles/version.txt")).unwrap());
        write_manifest(&manifest);
        assert_eq!(
            verify(&root).unwrap_err().to_string(),
            "Client/server version mismatch"
        );
        std::fs::remove_dir_all(root).unwrap();
    }
}
