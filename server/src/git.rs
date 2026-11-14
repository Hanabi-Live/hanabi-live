use std::{
    path::Path,
    process::{Command, Output},
};

/// The length of a full Git commit hash, which names a server and client revision. The build
/// script includes this file, so it depends only on the standard library.
pub const GIT_REVISION_LENGTH: usize = 40;

/// Runs Git in `root`, ignoring variables (set by Git hooks) that point it at another repository.
pub fn git(root: &Path, arguments: &[&str]) -> std::io::Result<Output> {
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
