use anyhow::{Context, Result, bail};
use std::{
    path::PathBuf,
    process::{Child, Command, Stdio},
    time::{Duration, Instant},
};

pub struct RedisFixture {
    pub directory: PathBuf,
    pub url: String,
    child: Option<Child>,
    aof: bool,
}

impl RedisFixture {
    pub async fn start(aof: bool) -> Result<Self> {
        let directory =
            std::env::temp_dir().join(format!("hanabi-redis-{:032x}", rand::random::<u128>()));
        std::fs::create_dir(&directory)?;
        let url = format!("redis+unix://{}", directory.join("state.sock").display());
        let mut fixture = Self {
            directory,
            url,
            child: None,
            aof,
        };
        fixture.restart().await?;
        Ok(fixture)
    }

    pub fn kill(&mut self) -> Result<()> {
        if let Some(mut child) = self.child.take() {
            if child.try_wait()?.is_none() {
                child.kill()?;
            }
            child.wait()?;
        }
        Ok(())
    }

    pub async fn restart(&mut self) -> Result<()> {
        self.kill()?;
        let mut command = Command::new("redis-server");
        command
            .env_clear()
            .env("HOME", &self.directory)
            .args([
                "--port",
                "0",
                "--unixsocketperm",
                "700",
                "--save",
                "",
                "--appendfsync",
                "always",
                "--auto-aof-rewrite-percentage",
                "0",
            ])
            .arg("--unixsocket")
            .arg(self.directory.join("state.sock"))
            .arg("--dir")
            .arg(&self.directory)
            .arg("--logfile")
            .arg(self.directory.join("redis.log"))
            .arg("--appendonly")
            .arg(if self.aof { "yes" } else { "no" })
            .stdout(Stdio::null())
            .stderr(Stdio::null());
        for key in ["PATH", "LD_LIBRARY_PATH"] {
            if let Some(value) = std::env::var_os(key) {
                command.env(key, value);
            }
        }
        self.child = Some(
            command
                .spawn()
                .context("Redis tests require redis-server 7.2 or newer on PATH")?,
        );
        let deadline = Instant::now() + Duration::from_secs(5);
        loop {
            if self
                .child
                .as_mut()
                .context("Missing Redis child")?
                .try_wait()?
                .is_some()
            {
                bail!(
                    "Redis exited during startup: {}",
                    std::fs::read_to_string(self.directory.join("redis.log"))?
                );
            }
            let client = redis::Client::open(self.url.as_str())?;
            if let Ok(mut connection) = client.get_multiplexed_async_connection().await
                && redis::cmd("PING")
                    .query_async::<String>(&mut connection)
                    .await
                    .is_ok()
            {
                return Ok(());
            }
            if Instant::now() >= deadline {
                bail!("Redis fixture did not become ready");
            }
            tokio::time::sleep(Duration::from_millis(10)).await;
        }
    }
}

impl Drop for RedisFixture {
    fn drop(&mut self) {
        if let Err(error) = self.kill() {
            eprintln!("Failed to stop Redis fixture: {error}");
        }
        if let Err(error) = std::fs::remove_dir_all(&self.directory) {
            eprintln!("Failed to remove Redis fixture: {error}");
        }
    }
}
