# Hanab Live Installation

## For Development

We recommend running the server, PostgreSQL, and Redis in containers with
[Podman](https://podman.io/). This keeps the build tools and databases off your
host; you only need Git, Podman, and a Compose provider such as
[podman-compose](https://github.com/containers/podman-compose).

Install Podman using its
[installation instructions](https://podman.io/docs/installation) and install
your Compose provider. On macOS, initialize and start the Podman virtual machine
with `podman machine init` and `podman machine start`. On Windows, follow these
instructions inside WSL2. Run the commands below as your normal user, without
`sudo`.

Clone the repository and create your local configuration:

```sh
git clone https://github.com/Hanabi-Live/hanabi-live.git
cd hanabi-live
cp .env.example .env
```

In `.env`, set `SESSION_SECRET` to a random 128-character alphanumeric string
(for example, generate one with `openssl rand -hex 64`). Keep
`DOMAIN="localhost"`; the development Compose file configures the database,
Redis, and server ports for you. Do not commit `.env`.

Build and start the development stack from a clean checkout:

```sh
git status --short
export HANABI_BUILD_REVISION="$(git rev-parse HEAD)"
podman compose --file docker-compose-dev.yml up --build --detach
podman compose --file docker-compose-dev.yml logs --follow hanab-live-server
```

If `git status --short` lists changes, commit your development changes before
building. If Podman asks which registry to use for the base images, select
`docker.io`. The first build can take a while and needs several GB of RAM and
disk space. Make sure host ports 1212 and 5432 are available.

Once the server is ready, open <http://localhost:1212/lobby> for the classic
client or <http://localhost:1212/new> for the new client. Press Ctrl+C to stop
following logs; the containers keep running.

The database schema is installed automatically on the first start. PostgreSQL
and Redis data persist in named volumes. Do not run the source-installation
schema script against this database or use `down --volumes` to update it.

Before stopping or rebuilding, save active games and shut down the server:

```sh
podman compose --file docker-compose-dev.yml exec hanab-live-server \
  wget --quiet --output-document=- http://127.0.0.1:8081/gracefulStop
podman ps --all --filter label=com.docker.compose.service=hanab-live-server
```

Wait until `hanab-live-server` has exited successfully before running
`podman compose --file docker-compose-dev.yml down`. This removes the
containers, but retains their data volumes.

To try code changes, commit them, shut down the stack as above, and repeat the
build/start commands, including the revision export. Source files are copied
into the image, so there is no automatic reload. For client watchers and running
tools directly on your host, follow the source-installation sections below
instead. Existing databases need explicit
[migrations](#local-configuration-and-storage) when the schema changes.

## For Production

## Prerequisites

Use Linux for production. Development also supports macOS; on Windows, use WSL2
rather than native Windows server binaries. CI and process-level tests run on
Linux.

For a source installation, install:

- Git and the Rust toolchain selected by `rust-toolchain.toml` through
  [rustup](https://rustup.rs/).
- The Bun version pinned in root `package.json` for JavaScript tooling.
- PostgreSQL (CI uses PostgreSQL 18) and matching client tools.
- Redis 7.2 or newer.
- Python 3.12+, Bash, and ShellCheck.
- Go 1.27 for the pinned Tern migration tool only; application code is Rust.

Client and native release builds require several GB of RAM and disk space. Keep
databases and Redis bound to localhost or a private network.

## JavaScript tooling

Bun manages dependencies and runs JavaScript tools. From the repository root:

```sh
bun install --frozen-lockfile
bun run build-client
bun run test
bash lint.sh
```

`bun run test` prepares the Rust process-test backend when a disposable
`HANABI_TEST_DATABASE_URL` is supplied, then runs the migrated suites with
native Bun tests and per-file isolation. For a focused unit test, use
`bun test --isolate --tsconfig-override tsconfig.monorepo.json PATH`. Use
`bunx --bun --no-install` for installed tools so checks cannot silently download
unlocked versions.

External versions belong in the root `workspaces.catalog`; manifests use
`catalog:` for these dependencies and `workspace:*` for local packages. To
change a version, edit its catalog entry, run `bun install`, and commit the
manifest and lockfile. `bun run update` honors version locks and the update
cooldown. Dependency lifecycle scripts are restricted to `trustedDependencies`.
Automatic `.env` loading is disabled in `bunfig.toml`. The migrated lockfile's
`configVersion: 0` retains hoisted installs without an explicit linker setting.

## Local configuration and storage

Clone the repository with full history and copy `.env.example` to `.env`.
Generate a random 128-character `SESSION_SECRET`, set `DOMAIN=localhost`, and
choose an unprivileged HTTP port such as `PORT=8080`. `LOCALHOST_PORT` must be
different. Configure the PostgreSQL host, database, user, and password.

Create a dedicated database owned by the application user. Run
`./install/install-database-schema.sh` **only for a new, empty database**; it
installs the full schema and records its migration version. Existing databases
must use `./install/migrate.sh status` and `./install/migrate.sh apply`.
Databases older than schema version 7 must first upgrade to version 7 using an
earlier release.

Redis is authoritative live-game storage, not a disposable cache. For local
development, `REDIS_URL` defaults to `redis://127.0.0.1:6379`; run Redis with:

```text
bind 127.0.0.1
appendonly yes
appendfsync always
maxmemory-policy noeviction
```

Retain its data directory across restarts. Authenticated TLS and Unix sockets
are supported. Do not expose an unauthenticated Redis port publicly.

The server normally binds local domains to loopback. `LISTEN_HOST=0.0.0.0` is
needed inside containers so port forwarding can reach it without changing the
cookie domain. It does not expose the separate localhost control listener.

## Running the server in development

Build both clients and the server:

```sh
./install/install-dependencies.sh
./run.sh
```

`run.sh` builds `server/target/release/hanabi-live`, installs it at the
repository root, and runs it against `.env`. Open `http://localhost:8080/lobby`
or `/new` when using the suggested port.

`./dev.sh` runs Rust and the classic-client watcher together. For React
development, leave Rust on port 8080 and run `bun run dev` inside
`packages/client-new`; Vite proxies authentication, WebSockets, API requests,
and shared game assets to that local server. Refresh after changing client code;
rebuild and restart after changing Rust.

Use `nix develop` for the supplied Nix tool environment. Its local Redis
instance must use the persistence settings above.

## Checks

Run `bash lint.sh` before pushing, plus the relevant tests and builds. Native
unit and engine tests:

```sh
cargo test --locked --manifest-path server/Cargo.toml
cargo test --locked --manifest-path server/engine/Cargo.toml
```

For database/process/browser tests, set `HANABI_TEST_DATABASE_URL` to a
**disposable local PostgreSQL administrator connection**. Put `redis-server` and
`redis-cli` on `PATH`; the process/browser fixtures start private Redis
instances. Never point tests at production.

```sh
HANABI_TEST_DATABASE_URL='postgres://postgres@127.0.0.1:5432/postgres?sslmode=disable' \
  bun run test
```

See the [server runbook](../server/README.md) for native Redis tests and SQLx
metadata regeneration.

## Running the server in production

Prefer approved, immutable Rust releases. PostgreSQL and Redis must be backed up
together with cross-store consistency. Preserve the Redis namespace, configured
database identity, cookies' `SESSION_SECRET`, and live-state data.

Run `./deploy.sh` from your laptop to deploy the existing source-layout
installation over SSH to `root@hanab.live:/root/hanabi-live`. Deployment
credentials and dependencies stay on production; export the GitHub token in its
login-shell environment. `./deploy.sh --check` verifies the approved
current-main release without deploying. `./deploy.sh` publishes it and requests
a graceful restart; reviewed pending migrations require `--apply-migrations`.
See [AGENTS.md](../AGENTS.md) for production safeguards.

Run the wrapper from an up-to-date `main` checkout: it sends its matching
deployment tools over SSH, so an older production checkout can accept the new
release format without updating live files during `--check`.

Bash filenames use hyphens. When upgrading an existing installation, update
external cron jobs and certificate-renewal hooks to the renamed scripts,
including `database-backup.sh` and `renew-cert.sh`; old underscore paths are not
retained as wrappers.

Rust loads its client version at startup, so client-only changes also require a
graceful restart. Never rebuild assets in place while they are being served.
Build and verify both clients in staging, preserve old versioned assets for open
tabs, and publish paired assets and binaries atomically.

With TLS and `DOMAIN=hanab.live`, page requests on `hanabi.live`,
`www.hanab.live`, and `www.hanabi.live` redirect to `hanab.live`, preserving the
path and query. Keep certificates valid for all four names. Existing WebSocket
handshakes and background browser requests are not redirected, so open alias
tabs can reconnect.

### Dedicated production Redis

The templates in [`install/redis/`](../install/redis/) reproduce the dedicated
production Redis configuration: Unix-socket access only, durable AOF writes, no
eviction, and a 768 MiB memory limit. Allow additional RAM for Redis overhead
and background persistence. Install Redis **7.2 or newer** and its CLI first;
older distribution packages may not support the required `WAITAOF` command.

For a **fresh host**, run these commands as root from the repository root,
before starting the application:

```sh
/usr/bin/redis-server --version
useradd --system --user-group --home-dir /var/lib/hanabi-redis \
  --no-create-home --shell /usr/sbin/nologin hanabi-redis
install --directory --owner root --group hanabi-redis --mode 750 /etc/hanabi-redis
install --owner root --group hanabi-redis --mode 640 \
  install/redis/redis.conf /etc/hanabi-redis/redis.conf
install --owner root --group root --mode 644 \
  install/redis/hanabi-redis.service /etc/systemd/system/hanabi-redis.service
systemctl daemon-reload
systemctl enable --now hanabi-redis
```

The unit assumes `/usr/bin/redis-server`. If Redis is installed elsewhere,
change `ExecStart` in the installed unit before enabling it. Existing production
uses `/opt/hanabi-redis/7.2.17/bin/redis-server`; do not replace that binary or
its service configuration as part of routine application deployment.

Systemd creates `/run/hanabi-redis` and `/var/lib/hanabi-redis`, owned by
`hanabi-redis` with mode `0700`. The socket is also mode `0700`; this matches
the existing root-run application. A non-root application needs explicitly
reviewed socket-directory and socket permissions; do not make Redis publicly
accessible.

Set this in the application's `.env`:

```text
REDIS_URL=redis+unix:///run/hanabi-redis/redis.sock
```

Verify readiness and durability before starting the application:

```sh
systemctl status --no-pager hanabi-redis
redis-cli -s /run/hanabi-redis/redis.sock PING
redis-cli -s /run/hanabi-redis/redis.sock CONFIG GET appendonly appendfsync maxmemory-policy
redis-cli -s /run/hanabi-redis/redis.sock WAITAOF 1 0 5000
```

Expect `PONG`, `appendonly=yes`, `appendfsync=always`,
`maxmemory-policy=noeviction`, and a `WAITAOF` result of `[1, 0]`. Inspect
failures with `journalctl --unit hanabi-redis --no-pager`.

These are not upgrade or recovery commands. On existing installations, preserve
the entire `/var/lib/hanabi-redis` directory, socket path, and database
identity; never initialize an empty replacement to bypass recovery failures.
Coordinate Redis maintenance with a graceful application stop and consistent
PostgreSQL and Redis backups. Do not restart Redis underneath a running game
server.

### Service management

`./install/install-supervisor.sh` installs the source-layout service; inspect
its paths and account before running it. Start only an already stopped service:
`supervisorctl start hanabi-live`.

Use the configured loopback control port:

```sh
curl --silent --fail --show-error --location http://127.0.0.1:8081/gracefulRestart
curl --silent --fail --show-error --location http://127.0.0.1:8081/gracefulStop
```

Do not use `supervisorctl stop` or `supervisorctl restart` on a running game
server. An HTTP success response does not establish that restart completed:
verify the running revision, client assets, restored tables, and logs.
`/gracefulRestart` drains and replaces the prepared binary; it does not compile.

`./restart-service-only.sh` delegates to `admin/gracefulRestart.sh`, which
requests the Rust lifecycle endpoint without pulling source or rebuilding.

For a short maintenance pause with active games, use
`bash admin/gracefulStop.sh` (the loopback `/gracefulStop` endpoint). It
immediately drains admitted work, saves active games and clocks durably, tells
clients to reconnect, and exits without replacing the process or terminating
games. Existing restart clock grace still applies; time while the process is
stopped is not charged to players.

The HTTP response only acknowledges the request. Before maintaining PostgreSQL
or copying state, verify the process exited successfully, the log reports
`The server successfully shut down.`, and no supervisor restarts it. Use
`autorestart=unexpected`, `exitcodes=0`, and `startsecs=0` (or systemd
`Restart=on-failure`), not an always-restart policy. On a drain failure, stop
the maintenance procedure and inspect recovery; do not assume progress was
saved.

After storage is ready, explicitly start the stopped application and verify
recovery health and client reconnects. Keep pauses short: pregame seats have a
60-second reconnect grace after startup. For a host migration, fence the old
application before starting the new one; never run two writable copies.

### Opt-in CI releases (Linux amd64)

Release construction runs in parallel with validation. `candidate-` artifacts
are unapproved outputs and must not be deployed. Only `publish_native_release`
publishes `hanabi-live-rust-<revision>-linux-amd64` after all required checks
succeed. Retained artifact names and `<revision>-rust` installation directories
keep existing deployment tooling compatible.

Release format 2 uses the full Git SHA as the client/server identity; shallow
checkouts are sufficient to build it. Use the updated `install/release.py` to
install these bundles. It also verifies existing format-1 releases with numeric
client versions.

Verify the repository, successful main-branch CI run, revision, and checksum.
The archive contains the static Rust executable, paired clients, schema,
migrations, and Tern. The host needs Python 3.12+, Bash, PostgreSQL, and Redis,
not compilers or JavaScript tools.

With separate operator authorization:

```sh
python3 install/release.py init /opt/hanabi-live
python3 install/release.py stage /opt/hanabi-live ./hanabi-live-rust-REV-linux-amd64.tar.gz TRUSTED_SHA256
python3 install/release.py activate /opt/hanabi-live REV --apply-migrations
```

`init` requires a new deployment root. Stage and activate only while the old
service is gracefully stopped. Provision `shared/.env`, certificates, and
optional `motd.txt`; retain the same PostgreSQL and Redis state. Install
`install/supervisor/hanabi-live-release.conf` with the correct paths and
account, then explicitly start and verify the service. Releases should be
operator-owned and read-only to the service account.

Activation holds the lifecycle lock, runs forward migrations, verifies startup,
and atomically changes `current`; it never starts a process. Failed migrations
may advance the schema even when the pointer is unchanged. Exit status 2
indicates that a rename succeeded but directory durability could not be
confirmed. Inspect the recorded state and repair storage; never automatically
roll back or restart an older binary. Only Rust releases can be verified,
staged, or activated. Upgrades require GitHub API access and `GH_TOKEN` or
`GITHUB_TOKEN_PERSONAL_CLASSIC` to verify that the target revision descends from
the current revision. An unavailable ancestry check refuses activation before
migrations; hashes are never compared numerically or lexicographically.

Unresolved old checkpoints require recovery with a compatible pre-promotion
release, not deletion or a new empty Redis namespace.

To build a local bundle on Linux amd64, install `musl-tools`, add Rust target
`x86_64-unknown-linux-musl`, and run:

```sh
bash install/build-release.sh dist/native
```

Local dirty builds are untrusted; only successful clean CI artifacts are
deployment inputs.

### Containers

The Dockerfile builds the same verified Rust release. Compose files include
durable Redis storage with AOF and no eviction. Configure a real
`SESSION_SECRET` in `.env`; `docker-compose-dev.yml` builds the database schema
image locally. Existing database volumes need explicit migration, never
reinitialization. Do not delete PostgreSQL or Redis volumes to update a
container. Container deployments require deliberate migration and orderly
shutdown, not a forced kill.

Container builds exclude `.git` and require `HANABI_BUILD_REVISION`, passed as a
Docker build argument to both clients, Rust, and the release manifest. Check
checkout cleanliness on the host first:

```sh
status=$(git status --porcelain --untracked-files=normal) \
  && test "$status" = "" \
  && docker build --build-arg HANABI_BUILD_REVISION="$(git rev-parse HEAD)" .
```

For Compose, run the same cleanliness check and export
`HANABI_BUILD_REVISION=$(git rev-parse HEAD)` before
`docker compose up --build`. Ordinary source builds still discover the revision
from Git. Container manifests record cleanliness as unknown (`dirty: null`), not
as verified clean; they do not replace approved native CI artifacts for
source-layout production deployments.

### Backups and TLS

`database-backup.sh` streams PostgreSQL backups into gzip with disk-space and
concurrency guards. It does **not** back up Redis. Retain coordinated backups of
both stores; never discard the newest completed backup just to free disk space.
Its optional Google Drive upload uses the configured service account and
installed `gdrive` tool.

Set `TLS_CERT_FILE` and `TLS_KEY_FILE` together to enable HTTPS. The server also
serves certificate challenges and HTTP-to-HTTPS redirects. If using
`renew-cert.sh`, configure certificate renewal through its deploy hook so a
graceful restart loads the new certificate; avoid a competing renewal timer that
renews certificates without restarting the server. Keep database, Redis, and
control ports private.
