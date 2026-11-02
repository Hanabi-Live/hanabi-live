# Rust benchmark PoC

This is a benchmark-only prototype, not a production replacement. Run it through
the shared harness; it creates disposable databases and fixture directories:

```sh
HANABI_TEST_DATABASE_URL='postgres://postgres@127.0.0.1:5432/postgres?sslmode=disable' \
  npm test -- --runInBand packages/server/src/mainProcess.test.ts \
  --testNamePattern='normal-server comparison'
```

The harness builds Rust in release mode using the pinned toolchain and Cargo
lockfile. It runs the same client wire workload against Go, TypeScript, and
Rust. See [the measurements and limitations](../../docs/server-evaluation.md).

For Rust-specific checks, from this directory:

```sh
cargo fmt --check
cargo clippy --locked --all-targets -- -D warnings
HANABI_TEST_DATABASE_URL='postgres://postgres@127.0.0.1:5432/postgres?sslmode=disable' \
  cargo test --locked
```

The Cargo PostgreSQL test requires a connection URI. Without it, that database
case is skipped. The normal server harness also tests process death, failed
writes, session replacement during persistence, and durable request
deduplication.

## Ownership and wait ordering

The coordinator owns the session directory, generations, and table handles. Each
table actor exclusively owns its phase and game state. Socket reader, command
worker, and writer tasks have separate responsibilities. Immutable configuration
is parsed without modifying process environment variables.

```text
connection worker -> coordinator --non-blocking--> table actor -> PostgreSQL
table effects    -> coordinator --non-blocking--> socket writer
```

Table actors may wait for storage or coordinator capacity. The coordinator never
waits for table processing or socket writes, so there is no reverse application
wait edge. There are no shared mutable table mutexes. Bounded channels, byte
budgets, and owned capacity permits also cover pending replay loads;
cancellation returns capacity automatically. Slow clients are disconnected, not
allowed to block tables.

Live game commands mutate a private candidate. Checkpoint commit precedes
publication; terminal checkpoints precede atomic game/participants/actions/deck
completion. Storage uncertainty freezes that table until recovery. Generation
checks at admission and publication prevent old connections from acting or
receiving new private results. Typed events have a separate recipient
projection; internal cards are never serialized directly to a live player.

This design removes shared-table lock ordering, not every possible logical race
or database failure. Tests cover saturation, replacement, stale writers,
rollback, terminal recovery, and conflicting completion retries. Rust's type
system alone is not a proof of correct concurrency.

## Deliberate scope

Supported: two-player untimed **No Variant**, default modifiers, ordinary plays,
discards and clues, optional 50-card custom decks, account registration/Argon2
login, Go-compatible signed cookies, lobby bootstrap, table start/reattend,
historical solo replay loading, completion statistics, and crash recovery.

Unsupported commands and modes are rejected. There is no full browser frontend,
other variants/player counts, timed games, replay editing, authored notes/tags,
chat commands/table chat, Discord, administration, Unicode account
normalization, or legacy password upgrade. Historical reads reject unsupported
game options and authored notes. The benchmark does not exercise these missing
features.

The binary binds only loopback and refuses non-local configuration or database
names outside the harness's `ts_slice_` namespace. It applies no migrations. Its
active checkpoint format is Rust-specific; never switch a real installation
between runtimes with unresolved games. Completed standard games use the shared
schema and sparse custom-deck encoding.

The legacy RNG port uses the existing
[Go RNG constants and license](../../packages/server/src/engine/goRandom.LICENSE).
Go-generated cookie, random, and standard-game fixtures verify compatibility.
