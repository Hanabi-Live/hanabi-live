# Native Rust server

This is the production Hanab Live server. It uses native Rust rules and
actor-owned tables. PostgreSQL stores the live tables and the historical data.

## Running

Use a separate development checkout/configuration and disposable storage before
considering a deployment. Build the existing client assets and apply PostgreSQL
migrations with `hanabi-live migrate apply`. Rust uses the existing `.env`
settings.

From the repository root:

```sh
cargo build --release --locked --manifest-path server/Cargo.toml
./server/target/release/hanabi-live
```

`--version` reports its compiled Git commit. `--check-startup` validates local
configuration, assets, and TLS without taking storage ownership; normal startup
also validates the database, takes ownership of the live tables, and restores
them.

Build/install the replacement binary and paired client before requesting
`/gracefulRestart`. The loopback control plane performs preflight, durable
drain, and process replacement; it does not compile source inside the running
server. `/gracefulStop` uses the same durable drain but exits without
replacement, preserving active games and allowing clients to reconnect after an
explicit start. It never terminates unfinished games. SIGTERM and SIGINT also
drain admitted work. Ownership/durability loss exits with an error rather than
pretending shutdown succeeded.

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
python3 server/sqlx_schema.py --write
python3 server/sqlx_schema.py
```

The script creates a unique database, loads the canonical schema, prepares all
Rust targets, and drops that database afterward. It refuses remote database
hosts and does not read the application's `.env`. Commit the regenerated `.sqlx`
files. CI runs the check-only command to reject missing or stale metadata. A
NULL password hash means the account requires a password reset. Explicitly mark
nullable outer-join columns.

## Immutable releases

CI publishes `hanabi-live-<revision>-linux-amd64`. It contains the statically
linked Rust binary named `hanabi-live` (which embeds the schema and migrations),
paired client assets, and the word list. No Node, Cargo, or compiler is needed
on the deployment host; installation uses Python, Bash, and PostgreSQL.

To build locally on Linux amd64, install `musl-tools`, add Rust's
`x86_64-unknown-linux-musl` target, and run:

```sh
bash install/build-release.sh dist/release
```

Use the checksum-verified release installer. Activate with:

```sh
python3 install/release.py activate /absolute/deployment/root REVISION \
  --apply-migrations
```

Activation requires the service to be stopped and holds the shared lifecycle
lock. Only Rust releases can be verified, staged, or activated.

## Storage and ownership

PostgreSQL stores the live tables: pregames, live games, and replays. It also
stores accounts, completed games, notes, tags, chat, and statistics. Its backups
cover all of them.

Installations that kept the live tables in Redis must move them once. Stop the
previous release with `/gracefulStop`. Then run `hanabi-live migrate apply` and
`hanabi-live migrate import-redis` with the new release, which reads
`REDIS_URL`. The server does not start until the import is done.

Pregame players have a 60-second reconnect grace period, including after server
recovery. Disconnected players are then removed, ownership passes to a remaining
player, and empty pregames are durably deleted. Connected-but-AFK players keep
their seats. This cleanup does not expire players from ongoing games.

Replay rooms with no connected viewers also expire after a 60-second reconnect
grace, including after server recovery. Rejoining cancels that deadline;
explicitly leaving the last seat still removes the room immediately.

Review rooms have a 30-minute idle window. Joining or reconnecting, replay
controls, and user chat in shared reviews refresh it; server announcements do
not. Normal game completion starts a fresh review window, including recovery of
an interrupted completion. Idle-ended games retain their expiry behavior.

One coordinator owns sessions and table handles; each table actor exclusively
owns its mutable state. The coordinator never waits for table processing or
socket writes. Queues, byte budgets, and capacity permits are bounded. Session
generation and monotonic ownership checks guard admission and publication.

Mutations follow candidate -> durable checkpoint -> publication. Terminal
checkpoints precede idempotent PostgreSQL completion. Uncertain table writes
freeze the table. Loss of ownership, or a write that the database cannot
confirm, closes admission for the whole instance. Recovery validates snapshots
and completes pending archive operations.

One server owns the live tables at a time. A dedicated connection holds a
session advisory lock for as long as the server runs. Each new owner increments
an ownership epoch. Every live-table write locks that epoch and commits only
while it is current, so an earlier owner cannot write after a new one starts.

## Verification

The normal process harness uses owned PostgreSQL databases:

```sh
HANABI_TEST_DATABASE_URL='postgres://postgres@127.0.0.1:5432/postgres?sslmode=disable' \
  bun run test
```

Native checks, from this directory:

```sh
cargo fmt --all --check
cargo clippy --locked --workspace --all-targets -- -D warnings
cargo deny --locked --workspace check
cargo machete
HANABI_TEST_DATABASE_URL='postgres://postgres@127.0.0.1:5432/postgres?sslmode=disable' \
  cargo test --locked --workspace
```

Database tests require a disposable PostgreSQL connection URI. Process checks
exercise real client messages, recovery, clock allowances, session replacement,
and storage failures. Rust's type system alone is not a proof of correct
concurrency.

The RNG port retains the existing
[Go license](../packages/data/src/json/goRandom.LICENSE).
