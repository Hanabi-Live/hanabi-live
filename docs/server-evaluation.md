# Server evaluation

The [native Rust server](../server/README.md) runs in production.

## Reproducible workload

With Bun, Rust/rustup, Redis 7.2+ binaries, and a disposable local PostgreSQL
service available:

```sh
export HANABI_TEST_DATABASE_URL='postgres://postgres@127.0.0.1:5432/postgres?sslmode=disable'
bun packages/testing/src/mainProcessSetup.ts
bun test --isolate --tsconfig-override tsconfig.monorepo.json packages/testing/src/mainProcessComparison.test.ts
```

Rust runs in a separate release-mode process. Browser wire messages exercise
login, signed cookies, four concurrent lanes, eight 25-point games, 200 plays,
eight live reconnects, and, after restarting the process, 160 historical replay
reads and 80 reconnect/replay reads.

Every game must finish correctly and restored hands must remain private. The
server uses the explicit played deck through the normal custom-deck storage
path. The harness verifies stored actions, participants, custom decks, settled
statistics, and reconstruction after restart.

The current Rust implementation uses Redis AOF/`WAITAOF` for recoverable state
and PostgreSQL for accounts/history. The harness creates its private Redis
sidecar. Its `postgresCheckpointWrites` should therefore be zero, not
interpreted as an absence of durable checkpoints. Server RSS excludes the Redis
sidecar.

New account passwords use Argon2 with 64 MiB, three passes, and four lanes.
Existing hashes are verified using their stored parameters and upgraded after a
successful login when necessary.

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

## Compatibility boundaries

Old custom decks that were never saved cannot be reconstructed. The native Rust
engine preserves historical replay interpretation.

Rust's process signals drain admitted work. Unresolved legacy checkpoints
require a compatible earlier release.

The full-server acceptance suite also covers command and HTTP handlers,
malformed input, recipient isolation, storage failure, interrupted completion,
and process recovery. Rust adds actor saturation, session-generation fencing,
atomic completion, and real crash/ failed-write recovery checks. Deployment and
live-player acceptance remain separate operational work.
