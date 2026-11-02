# Server comparison

Keep Go as the production authority; do not start a Rust rewrite. TypeScript now
implements the normal client protocol and durable game lifecycle, but functional
acceptance is not production migration approval. Its shared game types and rules
are useful; the measurements below do not justify switching for performance.

## Reproducible acceptance workload

With Go, Node, and a disposable local PostgreSQL service available:

```sh
HANABI_TEST_DATABASE_URL='postgres://postgres@127.0.0.1:5432/postgres?sslmode=disable' \
  npm test -- --runInBand packages/server/src/mainProcess.test.ts \
  --testNamePattern='normal-server comparison'
```

Each implementation runs as a separate, normal server process. The same browser
wire messages exercise login, signed cookies, four concurrent lanes, eight
25-point games, 200 plays, eight live reconnects, and, after restarting the
process, 160 historical replay reads and 80 reconnect/replay reads. Every game
must finish correctly; restored hands must remain private. Both use the same
explicit played deck, persisted through the normal custom-deck path.

Three local runs on a shared Linux host, with Go 1.27.0, Node 24.19.0, and
PostgreSQL 18.6, were repeated after profiling and optimization. The workload is
unchanged; the Go column is from the new paired runs:

| Measurement                         |          Go | TypeScript before | TypeScript after |
| ----------------------------------- | ----------: | ----------------: | ---------------: |
| Gameplay including account creation | 0.75-0.80 s |       1.47-1.55 s |      1.32-1.36 s |
| Play acknowledgement p95            |    11-12 ms |          21-27 ms |         18-22 ms |
| Live reconnect p95                  |    11-12 ms |          55-61 ms |         24-25 ms |
| Historical replay cycle p95         |    30-35 ms |        141-154 ms |         32-41 ms |
| Reconnect plus replay cycle p95     |    72-76 ms |        455-488 ms |       127-156 ms |
| Mixed historical-read phase         | 0.53-0.56 s |       2.83-2.93 s |      0.70-0.74 s |

These are application-path measurements, not language-only or capacity results.
The database, client driver, and server share a host. Replay cycles include
bootstrap, leaving the replay, and a `getName` command used as an ordering
barrier. They are not isolated replay-reconstruction timings.

V8 profiling found that generating table names scanned and copied the
87,000-word dictionary twice per request, consuming roughly half the initial
replay-phase profile. The barrier amplified this cost; welcome messages also
incurred it. Sampling without replacement now avoids those scans. Further
improvements prepare replay and connection metadata as single SQL statements,
reuse identical public message encodings, use native JSON after strict
validation, and avoid generating unused decks. Only compiled queries are cached,
not replay data, notes, friends, or moderation results.

Account creation is not identical hashing work: Go's defaults use one Argon2
pass, while Node's use three, with different parallelism. Those settings were
not weakened. Memory peaks include this concurrent hashing and are not
steady-state heap measurements; no language-level memory advantage is
established.

The remaining profiles are spread across socket writes, framework/serialization
work, database I/O, and replay computation rather than a comparable single
bottleneck. More invasive caching or protocol batching would need stronger
workload evidence. Validation, password hardening, and durability remain
required.

## Compatibility boundaries

Both servers share historical seeds, actions, sparse custom decks, and account
data. Their active checkpoint formats are runtime-specific: do not switch
implementations with unresolved active games. Old custom decks that were never
saved cannot be reconstructed. Go's legacy replay interpretation is retained.

TypeScript's process signals drain accepted work; existing Go source deployments
still require their documented graceful shutdown procedure. Operational metrics
describe each actual runtime rather than imitating another runtime's counters.
TypeScript intentionally omits retired Universal Analytics and excludes player
data from optional Sentry reports.

The acceptance suite also covers the Go-generated variant/character/replay
corpus, command and HTTP handlers, malformed input, recipient isolation, storage
failure, interrupted completion, and process recovery. Deployment, real Discord
credentials, and live-player acceptance remain separate operational work.
