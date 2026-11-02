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

## Storage and ownership

Redis is authoritative for recoverable pregames, live games, and replay state.
PostgreSQL retains accounts, completed games, notes, tags, chat, and statistics;
Rust does not mirror live checkpoints into `active_games`. Its snapshot format
is runtime-specific. Resolve existing Go/TypeScript active games before
switching runtimes, and preserve both Redis persistence and PostgreSQL backups.

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
  npm test -- --runInBand packages/server/src/mainProcess.test.ts
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
[Go license](../../packages/server/src/engine/goRandom.LICENSE).
