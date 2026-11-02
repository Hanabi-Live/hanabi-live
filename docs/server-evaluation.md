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
PostgreSQL 18.6, produced these ranges:

| Measurement                         |          Go |  TypeScript |
| ----------------------------------- | ----------: | ----------: |
| Gameplay including account creation | 0.77-0.82 s | 1.47-1.55 s |
| Play acknowledgement p95            |    11-13 ms |    21-27 ms |
| Live reconnect p95                  |    11-19 ms |    55-61 ms |
| Historical replay p95               |    31-38 ms |  141-154 ms |
| Reconnect plus replay p95           |    74-83 ms |  455-488 ms |
| Mixed historical-read phase         | 0.54-0.61 s | 2.83-2.93 s |

These are application-path measurements, not language-only or capacity results.
The database, client driver, and server share a host. Memory high-water marks
include concurrent password hashing and varied substantially: about 421-613 MiB
for Go and 460-485 MiB for Node. No memory advantage is established.

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
