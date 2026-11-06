# Native Rust server

The Rust implementation uses native rules and actor-owned tables, not a Go or
Node backend. Go remains the production authority; functional acceptance does
not authorize a production migration.

## Running

Use a separate development checkout/configuration and disposable storage before
considering a deployment. Build the existing client assets and apply the normal
PostgreSQL migrations. Rust uses the existing `.env` settings plus `REDIS_URL`.
For a local Redis instance:

```dotenv
REDIS_URL=redis://127.0.0.1:6379
```

Redis **7.2 or newer** is required, with AOF enabled and eviction disabled.
Recommended Redis settings:

```text
bind 127.0.0.1
appendonly yes
appendfsync always
maxmemory-policy noeviction
```

Do not expose Redis publicly. Authenticated TLS (`rediss://`) and local Unix
sockets (`redis+unix:///path/to/redis.sock`) are also supported.

From the repository root:

```sh
cargo build --release --locked --manifest-path experimental/rust-server/Cargo.toml
./experimental/rust-server/target/release/hanabi-rust-poc
```

The legacy binary name is retained for script compatibility. `--version` reports
its compiled Git commit. `--check-startup` validates local configuration,
assets, and TLS without taking storage ownership; normal startup also validates
the database, acquires the Redis lease, and restores durable tables.

Build/install the replacement binary and paired client before requesting
`/gracefulRestart`. The loopback control plane performs preflight, durable
drain, and process replacement; it does not compile source inside the running
server. SIGTERM and SIGINT also drain admitted work. Ownership/durability loss
exits with an error rather than pretending shutdown succeeded.

## Database queries

Static production SQL uses SQLx checked macros. Shared game records, statistics,
and settings have typed rows; completed-game counts and linked-account seed
selection share their business definitions. Dynamic filters and allowlisted
column updates remain parameterized SQL.

Checked macros decode by column position. Always list columns explicitly:
production tables upgraded over time can have a different physical column order
than a fresh schema. The metadata check rejects wildcard projections; runtime
regressions also exercise reordered columns.

Ordinary builds and lint use committed `.sqlx` metadata, with offline mode
enabled in the repository's `.cargo/config.toml`. No database is required. After
changing a query or schema, install the pinned preparation tool:

```sh
cargo install sqlx-cli --version 0.9.0 --locked --no-default-features --features rustls,postgres
```

Set `HANABI_TEST_DATABASE_URL` to a disposable local PostgreSQL administrator
connection, then run from the repository root:

```sh
python3 experimental/rust-server/sqlx_schema.py --write
python3 experimental/rust-server/sqlx_schema.py
```

The script creates a unique database, loads the canonical schema and migration
version, prepares all Rust targets, and drops that database afterward. It
refuses remote database hosts and does not read the application's `.env`. Commit
the regenerated `.sqlx` files. CI runs the check-only command to reject missing
or stale metadata. Keep nullable password hashes compatible with legacy
accounts, and explicitly mark nullable outer-join columns.

## Immutable releases

CI now publishes a separate `hanabi-live-rust-<revision>-linux-amd64` artifact.
It contains the statically linked Rust binary named `hanabi-live`, paired client
assets, the word list, schema/migrations, and the bundled migration tool. No Go,
Node, Cargo, or compiler is needed on the deployment host; installation uses
Python, Bash, PostgreSQL, and Redis.

To build locally on Linux amd64, install `musl-tools`, add Rust's
`x86_64-unknown-linux-musl` target, and run:

```sh
bash install/build_release.sh dist/rust-release rust
```

Use the existing checksum-verified release installer. Rust releases are stored
under `<revision>-rust`, allowing Go and Rust bundles of the same commit to
coexist. Activate with:

```sh
python3 install/release.py activate /absolute/deployment/root REVISION \
  --runtime rust --apply-migrations
```

Activation requires the service to be stopped. Both runtimes hold the shared
lifecycle lock while serving. Rust-to-Go activation is refused because it would
require a reviewed reverse-state migration.

## Temporary Go-to-Rust cutover

**This bridge is temporary and must be deleted after the permanent Rust
switch.** It imports the current Go version-2 checkpoints from PostgreSQL
`active_games`, not arbitrary legacy flat files. First run the updated Go server
so any older recovery files have been restored into its normal durable state.

1. Back up PostgreSQL, stage the Rust bundle, and configure a **fresh** Redis
   namespace with durable AOF. Preserve the Go `SESSION_SECRET` and database
   identity in Rust's `.env` so existing cookies/accounts keep working.
1. On the updated Go server, call:

   ```sh
   curl --fail --request POST http://127.0.0.1:${LOCALHOST_PORT:-8081}/rustCutover
   ```

   This drains commands, checkpoints the maintenance clock allowance once, and
   stops Go without terminating games. It writes `.go-to-rust-cutover`, which
   prevents that Go installation from restarting. Keep the service manager
   stopped afterward; do not use `supervisorctl stop/restart` on a running Go
   server and do not launch older binaries that lack the marker check.

1. Close other clients connected to the application database. From the staged
   Rust release, run:

   ```sh
   ./hanabi-live --import-go-checkpoints
   ```

   The command requires exclusive Redis ownership and refuses other database
   clients. It validates Go state, persists a Redis staging journal, atomically
   removes the PostgreSQL source rows, and promotes the native checkpoints.
   Table/game IDs, cards, clocks, pauses, notes, tags, votes, and request
   receipts are retained. Disconnected network sessions must reattend normally.

1. Activate/start Rust only after successful import. If interrupted, keep Go
   stopped and retry the same command against the same stores. Pending journals
   block normal Rust startup. **Do not delete either recovery copy or remove the
   Go marker to roll back after source removal.**

After the switch is permanent, remove `go_cutover*.rs`, their CLI/Store/state
hooks, Go's `go_rust_cutover*.go` and startup/route hooks, the cutover-specific
fixtures/tests, and the marker entries in runtime links/ignore files. Remove
this section and its contributor/install references too. Normal Rust recovery
and release installation must remain.

## Storage and ownership

Redis is authoritative for recoverable pregames, live games, and replay state.
PostgreSQL retains accounts, completed games, notes, tags, chat, and statistics;
Rust does not mirror live checkpoints into `active_games`. Its snapshot format
is runtime-specific. Use the temporary bridge for Go games; TypeScript
checkpoints are not accepted by that bridge. Preserve both Redis persistence and
PostgreSQL backups.

Pregame players have a 30-second reconnect grace period, including after server
recovery. Disconnected players are then removed, ownership passes to a remaining
player, and empty pregames are durably deleted. Connected-but-AFK players keep
their seats. This cleanup does not expire players from ongoing games.

Review rooms have a 30-minute idle window. Joining or reconnecting, replay
controls, and user chat in shared reviews refresh it; server announcements do
not. Normal game completion starts a fresh review window, including recovery of
an interrupted completion. Idle-ended games retain their expiry behavior.

The Redis namespace includes the configured PostgreSQL host, port, and database.
Keep that identity and the Redis endpoint stable across restarts, including the
spelling of otherwise-equivalent database hosts. Do not discard the Redis volume
even when no games are active: it also preserves non-reused table identities.

One coordinator owns sessions and table handles; each table actor exclusively
owns its mutable state. The coordinator never waits for table processing or
socket writes. Queues, byte budgets, and capacity permits are bounded. Session
generation and monotonic ownership checks guard admission and publication.

Mutations follow candidate -> durable checkpoint -> publication. Terminal
checkpoints precede idempotent PostgreSQL completion. Uncertain table writes
freeze the table; Redis connection or lease loss closes admission for the whole
instance. Recovery validates snapshots and completes pending archive operations.

Every state mutation is fenced by an exclusive expiring owner token and
confirmed with `WAITAOF` on the **same physical connection**. Transparent
reconnection is deliberately disabled: reconnecting would lose the write offset
being confirmed. Use one authoritative Redis instance with a stable clock and
persistent volume. Acknowledgements confirm its local AOF, not replica
durability: do not automatically fail over to a replica that can omit
acknowledged writes. This is not a claim of multi-master safety or protection
against losing that volume.

## Verification

The normal process harness uses owned PostgreSQL databases and private Redis
processes. Put `redis-server` and `redis-cli` on `PATH`:

```sh
HANABI_TEST_DATABASE_URL='postgres://postgres@127.0.0.1:5432/postgres?sslmode=disable' \
  npm test -- --runInBand packages/testing/src/mainProcess
```

Native checks, from this directory:

```sh
cargo fmt --all --check
cargo clippy --locked --all-targets -- -D warnings
HANABI_TEST_DATABASE_URL='postgres://postgres@127.0.0.1:5432/postgres?sslmode=disable' \
  cargo test --locked
cargo test --locked --manifest-path engine/Cargo.toml
```

Database tests require a disposable PostgreSQL connection URI. Rules are checked
against Go-generated decks, characters, transitions, and recipient projections.
Process checks exercise real client messages, recovery, clock allowances,
session replacement, and storage failures. Rust's type system alone is not a
proof of correct concurrency.

See [the comparison methodology](../../docs/server-evaluation.md). The RNG port
retains the existing
[Go license](../../packages/data/src/json/goRandom.LICENSE).
