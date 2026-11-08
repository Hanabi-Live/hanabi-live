use anyhow::{Context, Result, ensure};
use serde::Deserialize;
use sha2::{Digest, Sha256};
use std::os::unix::fs::OpenOptionsExt;
use std::{
    collections::BTreeMap,
    fs::{File, OpenOptions},
    io::Read,
    path::{Component, Path},
};

/// The release manifest format that `install/release.py` writes.
const RELEASE_FORMAT: u32 = 2;
/// The platform that native releases are built for.
const RELEASE_PLATFORM: &str = "linux-amd64";
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

/// The bytes read from a release file at a time while hashing it.
const HASH_BUFFER_BYTES: usize = 64 * crate::KIB;

fn hash_file(path: &Path) -> Result<String> {
    let mut file = File::open(path)?;
    let mut digest = Sha256::new();
    let mut buffer = vec![0; HASH_BUFFER_BYTES];
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
        manifest.format == RELEASE_FORMAT && manifest.platform == RELEASE_PLATFORM,
        "Unsupported native release"
    );
    ensure!(
        manifest.revision == crate::restart::version()
            && manifest.revision.len() == crate::revision::REVISION_LENGTH,
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

#[cfg(test)]
mod tests {
    use super::*;
    use serde_json::json;

    #[test]
    fn verify_requires_paired_sha_assets() {
        let root = crate::tls::fixture_root("hanabi-sha-release").unwrap();
        let revision = crate::restart::version();
        for (name, value) in [
            ("hanabi-live".into(), "binary"),
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
            "format": RELEASE_FORMAT,
            "platform": RELEASE_PLATFORM,
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
