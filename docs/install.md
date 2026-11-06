# Hanab Live Installation

The production server is Rust in `server/`. The classic client (`/lobby`) and
React lobby (`/new`) share the same server and game screen.

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
`./install/install_database_schema.sh` **only for a new, empty database**; it
installs the full schema and records its migration version. Existing databases
must use `./install/migrate.sh status` and `./install/migrate.sh apply`.

Redis is authoritative live-game storage, not a disposable cache. For local
development, configure `REDIS_URL=redis://127.0.0.1:6379` and run Redis with:

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
./install/install_dependencies.sh
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
instance must use the persistence settings above. The standalone maintenance
page can be served with `bash maintenance/run.sh` after gracefully stopping the
application; it uses Python and does not access the database.

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

Run `./deploy_rust.sh` from your laptop to deploy the existing source-layout
installation over SSH to `root@hanab.live:/root/hanabi-live`. Deployment
credentials and dependencies stay on production; export the GitHub token in its
login-shell environment. `./deploy_rust.sh --check` verifies the approved
current-main release without deploying. `./deploy_rust.sh` publishes it and
requests a graceful restart; reviewed pending migrations require
`--apply-migrations`. See [AGENTS.md](../AGENTS.md) for production safeguards.

Rust loads its client version at startup, so client-only changes also require a
graceful restart. Never rebuild assets in place while they are being served.
Build and verify both clients in staging, preserve old versioned assets for open
tabs, and publish paired assets and binaries atomically.

### Service management

`./install/install_supervisor.sh` installs the source-layout service; inspect
its paths and account before running it. Start only an already stopped service:
`supervisorctl start hanabi-live`.

Use the configured loopback control port:

```sh
curl --fail http://127.0.0.1:8081/gracefulRestart
curl --fail http://127.0.0.1:8081/shutdown
```

Do not use `supervisorctl stop` or `supervisorctl restart` on a running game
server. An HTTP success response does not establish that restart completed:
verify the running revision, client assets, restored tables, and logs.
`/gracefulRestart` drains and replaces the prepared binary; it does not compile.

### Opt-in CI releases (Linux amd64)

Release construction runs in parallel with validation. `candidate-` artifacts
are unapproved outputs and must not be deployed. Only `publish_native_release`
publishes `hanabi-live-rust-<revision>-linux-amd64` after all required checks
succeed. Retained artifact names and `<revision>-rust` installation directories
keep existing deployment tooling compatible.

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
roll back or restart an older binary. Existing Rust releases remain verifiable,
but Go releases can no longer be staged or activated.

The Go-to-Rust importer is retired. Unresolved old checkpoints require recovery
with a compatible pre-promotion release, not deletion or a new empty Redis
namespace. Applied migrations and persisted Rust formats are unchanged by this
source-layout cleanup.

To build a local bundle on Linux amd64, install `musl-tools`, add Rust target
`x86_64-unknown-linux-musl`, and run:

```sh
bash install/build_release.sh dist/native
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

### Backups and TLS

`database_backup.sh` streams PostgreSQL backups into gzip with disk-space and
concurrency guards. It does **not** back up Redis. Retain coordinated backups of
both stores; never discard the newest completed backup just to free disk space.
Its optional Google Drive upload uses the configured service account and
installed `gdrive` tool.

Set `TLS_CERT_FILE` and `TLS_KEY_FILE` together to enable HTTPS. The server also
serves certificate challenges and HTTP-to-HTTPS redirects. If using
`renew_cert.sh`, configure certificate renewal through its deploy hook so a
graceful restart loads the new certificate; avoid a competing renewal timer that
renews certificates without restarting the server. Keep database, Redis, and
control ports private.
