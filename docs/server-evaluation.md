# Server comparison

Go remains the production authority. TypeScript implements the normal client
protocol and durable lifecycle; the
[Rust PoC](../experimental/rust-server/README.md) implements the benchmark
subset. Neither functional acceptance nor these measurements authorize a
production migration.

## Reproducible workload

With Go, Node, Rust/rustup, and a disposable local PostgreSQL service available:

```sh
HANABI_TEST_DATABASE_URL='postgres://postgres@127.0.0.1:5432/postgres?sslmode=disable' \
  npm test -- --runInBand packages/server/src/mainProcess.test.ts \
  --testNamePattern='normal-server comparison'
```

Each implementation runs in a separate process. Go and TypeScript run their full
applications; Rust is a release-mode prototype. The same browser wire messages
exercise login, signed cookies, four concurrent lanes, eight 25-point games, 200
plays, eight live reconnects, and, after restarting the process, 160 historical
replay reads and 80 reconnect/replay reads.

Every game must finish correctly and restored hands must remain private. All
three use the same explicit played deck through the normal custom-deck storage
path. The harness verifies stored actions, participants, custom decks, settled
statistics, and independent reconstruction with the existing TypeScript engine.
PostgreSQL reported **232 checkpoint writes per implementation per run**.

Three fresh local runs on a shared Linux host used Go 1.27.0, Node 24.19.0, Rust
1.98.0, and PostgreSQL 18.6. Rounded ranges:

| Measurement                         |          Go |  TypeScript |    Rust PoC |
| ----------------------------------- | ----------: | ----------: | ----------: |
| Gameplay including account creation | 0.73-0.77 s | 1.27-1.32 s | 1.13-1.21 s |
| Play acknowledgement p95            |     9-12 ms |    18-19 ms |    17-19 ms |
| Live reconnect p95                  |    12-21 ms |    21-25 ms |     8-16 ms |
| Replay history ready p95            |    24-29 ms |    30-34 ms |    19-22 ms |
| Reconnect and history ready p95     |    54-55 ms |  117-138 ms |    41-44 ms |
| Historical replay cycle p95         |    31-37 ms |    32-39 ms |    24-28 ms |
| Reconnect plus replay cycle p95     |    73-78 ms |  131-154 ms |    54-62 ms |
| Mixed historical-read phase         | 0.53-0.58 s | 0.70-0.71 s | 0.46-0.50 s |

These are application-path measurements, not language-only or capacity results.
The database, client driver, and server share a host. Each sample measures one
client under concurrent load. Reconnects use an existing cookie and a fresh
WebSocket with full lobby bootstrap, not the optional lean-reconnect path. There
are only eight live reconnects per run, so that row's p95 is effectively the
largest sample.

Cycle timings include bootstrap, leaving the replay, and a `getName` command
used as an ordering barrier; reconnect cycles also include closing the socket.
The history-ready measurements stop when the initial game history is received,
before teardown. Neither measures browser rendering or internet latency.

## Interpretation

The initial TypeScript replay-phase profile spent roughly half its time
generating table names by scanning and copying the 87,000-word dictionary. The
ordering barrier amplified this cost; welcome messages also incurred it.
Removing those scans, consolidating SQL reads, sharing validated public
encodings, using native JSON, and avoiding unused deck generation reduced the
earlier mixed read phase from 2.83-2.93 seconds to roughly 0.7 seconds. Only
compiled queries are cached, not replay data or mutable account metadata.

Account creation is not identical hashing work: Go's defaults use one Argon2
pass, while Node uses three with different parallelism. Rust uses Node's 64
MiB/three-pass/four-lane parameters, but a different hashing library. No
password costs were weakened. Peak RSS was approximately 486-614 MiB for Go, 467
MiB for Node, and 278 MiB for Rust. These include concurrent hashing, different
allocators, and very different feature footprints; they are not steady-state
heap or full-server memory comparisons.

Rust was comparable to Go here, with better reconnect results than TypeScript,
but no play-acknowledgement advantage over Go. The smaller prototype, query
shapes, typed state representation, and scheduling differ from the full servers.
Equal checkpoint counts do not imply equal payload sizes or identical
lobby/pregame notification and chat side effects. This is not evidence of an
inherent language speedup or sufficient justification for a production rewrite.

## Compatibility boundaries

The full servers share historical seeds, actions, sparse custom decks, and
account data. The Rust prototype accepts only its documented standard-game
subset and rejects unsupported commands, options, and authored replay notes. Its
cookies and RNG match Go fixtures, and its standard rules match a Go-generated
authoritative event trace.

Active checkpoint formats are runtime-specific: do not switch implementations
with unresolved active games. Old custom decks that were never saved cannot be
reconstructed. Go's legacy replay interpretation is retained by TypeScript.

TypeScript's and Rust's process signals drain admitted work; existing Go source
deployments still require their documented graceful shutdown procedure.
TypeScript intentionally omits retired Universal Analytics and excludes player
data from optional Sentry reports.

The full-server acceptance suite also covers the variant/character/replay
corpus, command and HTTP handlers, malformed input, recipient isolation, storage
failure, interrupted completion, and process recovery. Rust adds actor
saturation, session-generation fencing, atomic completion, and real crash/
failed-write recovery checks. Deployment and live-player acceptance remain
separate operational work.
