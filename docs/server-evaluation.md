# Server comparison

Go remains the production authority. TypeScript and the
[native Rust server](../experimental/rust-server/README.md) are alternate
implementations. Neither functional acceptance nor these measurements authorize
a production migration.

## Reproducible workload

With Go, Node, Rust/rustup, Redis 7.2+ binaries, and a disposable local
PostgreSQL service available:

```sh
HANABI_TEST_DATABASE_URL='postgres://postgres@127.0.0.1:5432/postgres?sslmode=disable' \
  npm test -- --runInBand packages/server/src/mainProcess.test.ts \
  --testNamePattern='normal-server comparison'
```

Each implementation runs in a separate process; Rust is built in release mode.
The same browser wire messages exercise login, signed cookies, four concurrent
lanes, eight 25-point games, 200 plays, eight live reconnects, and, after
restarting the process, 160 historical replay reads and 80 reconnect/replay
reads.

Every game must finish correctly and restored hands must remain private. All
three use the same explicit played deck through the normal custom-deck storage
path. The harness verifies stored actions, participants, custom decks, settled
statistics, and independent reconstruction with the existing TypeScript engine.

The current Rust implementation uses Redis AOF/`WAITAOF` for recoverable state
and PostgreSQL for accounts/history. The harness creates its private Redis
sidecar. Its `postgresCheckpointWrites` should therefore be zero, not
interpreted as an absence of durable checkpoints. Storage now differs between
implementations; server RSS also excludes the Redis sidecar.

New account passwords now use the same Argon2 settings in all three servers: 64
MiB, three passes, and four lanes. Go still verifies existing hashes using their
stored parameters and upgrades older pass counts on successful login.

## Current Rust optimization measurements

### Checkpoint validation and archive reads

Three before/after runs used the same Redis-backed Rust workload, starting from
`a02fcc683`, with unchanged password costs, durability barriers, and client
messages. These are local shared-host observations, not capacity guarantees.

| Measurement                     |       Before |         After |
| ------------------------------- | -----------: | ------------: |
| Gameplay with account creation  |  1.00-1.03 s |        0.90 s |
| Play acknowledgement p50        | 1.71-1.81 ms |  1.25-1.49 ms |
| Play acknowledgement p95        |   4.0-4.3 ms |    2.8-5.4 ms |
| Replay history ready p95        | 32.7-34.0 ms |  25.4-25.5 ms |
| Reconnect and history ready p95 | 60.1-72.0 ms |  55.2-61.0 ms |
| Mixed historical-read phase     |  0.63-0.70 s | 0.566-0.568 s |

The clearest improvements are median play acknowledgement and historical reads;
the play p95 outlier shows why these results should not be treated as a
universal latency promise. Peak server RSS was essentially unchanged.

Typed engine validation no longer constructs and parses a JSON tree again. A
release-mode measurement of an 80-turn state with 286 events measured roughly
280 microseconds before versus 5 microseconds afterward, while retaining
collection limits and semantic validation. This is the validation cost, not a
50-fold improvement to an entire request.

Historical replay loading now shares one statement-snapshot archive query with
HTTP export, replacing 10-14 sequential database operations, including
per-player note queries. Mutable notes and tags are not cached. Shared
custom-deck decoding also prevents HTTP export from drifting from the native
engine's rank rules.

### Wire serialization

A follow-up starting from `238839212` removes the intermediate JSON tree from
`gameAction` and `gameActionList` messages. The shared frame writer also encodes
directly into its output buffer rather than using JSON's display formatter.
Recipient-specific privacy projection, queue limits, and durability are
unchanged.

A release-mode comparison ran both encoders in one process, measuring the median
of seven samples of 4,000 encodings for each two-player history:

| History events | Previous encoding | Direct typed encoding |
| -------------: | ----------------: | --------------------: |
|             10 |            5.5 us |                1.0 us |
|             76 |           44.1 us |                6.1 us |
|            286 |          154.7 us |               22.5 us |

This improves serialization CPU cost, not whole-request latency by the same
factor. Three fresh end-to-end runs before and after did **not** establish a
consistent latency improvement: mixed reads were 0.609-0.703 s before versus
0.617-0.665 s after; replay history-ready p95 was 27.7-33.7 ms versus 28.1-29.9
ms. Gameplay including account creation was 0.910-1.004 s versus 0.955-1.078 s.
Shared-host variability exceeds the small per-request encoding savings here.

## Historical PostgreSQL-backed baseline

The following measurements describe commit `55643c642`, before full Rust server
development and the Redis transition. PostgreSQL reported **232 checkpoint
writes per implementation per run** at that point; these numbers do not describe
the current Redis-backed implementation.

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
pass, while Node uses three with different parallelism. The Rust PoC used Node's
64 MiB/three-pass/four-lane parameters, but a different hashing library. No
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

The implementations share historical seeds, actions, sparse custom decks, and
account data. The measured Rust prototype above only implemented the standard
benchmark subset. The current native engine covers the full Go variant and
character corpora; server parity has separate real-process acceptance checks.

Active checkpoint formats are runtime-specific: do not switch implementations
with unresolved active games. Old custom decks that were never saved cannot be
reconstructed. Go's legacy replay interpretation is retained by TypeScript and
the native Rust engine.

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
