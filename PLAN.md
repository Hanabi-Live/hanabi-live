# Server Architecture and Hardening Plan

## Recommendation

Do not start over in Rust. Retain the modernized Go server as the sole
production authority. The bounded TypeScript experiment demonstrates
feasibility, but not production parity or a maintenance benefit sufficient to
justify migration. Keep TypeScript for the client and shared game utilities; do
not require a parallel server port for every Go change.

The largest opportunities are architectural: durable game state, simpler
concurrency, fewer duplicated rules, and safer deployment. A language change
alone does not provide those properties.

This plan follows a repository-wide architectural review on November 1, 2026,
covering both server implementations, shared game logic, the client/server
protocol, persistence, replay handling, tests, and deployment tooling. It is not
an exhaustive security certification or a production performance study.
Production traffic, resource usage, and database query plans were not measured.
The initial findings below describe the pre-hardening baseline; delivered work
and the subsequent local evaluation are recorded later in this plan.

## Current Architecture

| Component         | Assessment                                                                                                                                         |
| ----------------- | -------------------------------------------------------------------------------------------------------------------------------------------------- |
| Go server         | The complete application: gameplay, lobby, authentication, chat, spectators, replays, timers, statistics, Discord integration, and administration. |
| TypeScript server | An early implementation with useful infrastructure, but without core gameplay or production feature parity.                                        |
| `packages/game`   | Reusable TypeScript rules, variant definitions, reducers, deductions, and hypothetical-game functionality.                                         |
| TypeScript client | A feature-rich application integrated with the existing protocol and game semantics.                                                               |
| PostgreSQL        | The durable system of record; its operational and query-design requirements remain regardless of server language.                                  |

At the time of review, Go registered 43 WebSocket commands, while TypeScript
registered three chat-related commands. Ordinary TypeScript lobby/table chat
still reached TODO functions, its game schema contained only `datetimeStarted`,
and shutdown handling was a stub. The shared catalog contained 2,428 variant
definitions. These share rules, but their interactions make compatibility a
substantial project.

Relevant entry points:

- [Go command dispatch](server/src/command.go)
- [TypeScript command dispatch](packages/server/src/wsMessage.ts)
- [TypeScript chat implementation](packages/server/src/commands/commandChat.ts)
- [TypeScript game schema](packages/server/src/interfaces/Game.ts)
- [Shared game reducer](packages/game/src/reducers/gameReducer.ts)

## Audit Findings

### Game Durability

Active gameplay primarily lives in memory. Completed games are written to
PostgreSQL, and planned restarts serialize ongoing tables into local JSON files.
This supports controlled maintenance, not continuous crash recovery.
Serialization explicitly skips table locking to permit emergency saves during
deadlocks, and restored files are deleted afterward.

Game completion already stores the game, participants, and actions in a
transaction. Notes, chat, tags, and statistics are handled afterward and need
explicit failure and retry semantics.

Make accepted progress durable during play rather than depending on a successful
shutdown. Rewriting the same in-memory design in Rust would not fix its recovery
properties.

See [table serialization](server/src/serialize_tables.go) and
[game persistence](server/src/game_end.go).

### State Ownership and Concurrency

The Go server combines global membership locks, per-table locks, session locks,
timer tasks, and handlers calling other handlers with `NoTableLock` and
`NoTablesLock` flags. Database operations sometimes require unlocking,
performing I/O, then reacquiring and revalidating state.

Existing replay prefetching and game-completion snapshots deliberately keep
database calls outside table locks to avoid pool exhaustion and deadlocks.
Preserve that invariant while simplifying ownership.

Give each table one clear owner that processes commands sequentially. Unrelated
tables should proceed independently. This is possible in Go, TypeScript, or
Rust; Rust does not automatically prevent deadlocks, stale decisions, duplicate
commands, or incorrect transaction boundaries.

See [replay creation](server/src/command_replay_create.go),
[game completion](server/src/game_end.go), and
[table startup](server/src/command_table_start.go).

### Shared Rules Are Not Yet an Authoritative Engine

The TypeScript `gameReducer` consumes events such as draws, plays, clues, and
turn changes. It also handles player-visible information, deductions, notes, and
presentation-related state.

An authoritative engine must instead validate player commands and decide legal
moves, draws, turn progression, end conditions, and recipient-visible
information. The Go server currently owns those decisions. Its information
scrubbing includes spectator shadowing and special variants.

Extract a small authoritative core that reuses appropriate rules without making
client-visible state or hypothetical behavior authoritative.

See [the shared reducer](packages/game/src/reducers/gameReducer.ts),
[Go action handling](server/src/command_action.go), and
[information scrubbing](server/src/actions_scrub.go).

### Replay Compatibility

Historical replays reconstruct decks from seeds and re-execute stored actions.
Compatibility depends on seed conversion, random-number generation, shuffle
order, variant metadata, and historical behavior.

A replacement can appear correct for new games while changing historical deals.
Preserve the existing seed and replay contract, including during Go toolchain
upgrades. For new games, persist explicit initial conditions and an engine/rules
version.

See [seed conversion](server/src/misc.go),
[deck shuffling](server/src/game_deck.go), and
[replay execution](server/src/command_table_start.go).

### TypeScript Server Readiness

The partial server needs correctness work as well as missing features. For
example, at review time, `getNumGamesForUser` joined `games.id` to
`game_participants.id` instead of `game_participants.game_id`.

State ownership is also unresolved: table data is accessed through both an
in-memory map and Redis, and the table queue serializes operations globally
rather than independently per table. Modern frameworks and types are not
evidence of production parity.

See [game queries](packages/server/src/models/games.ts),
[in-memory tables](packages/server/src/tables.ts),
[Redis access](packages/server/src/redis.ts), and
[the table queue](packages/server/src/tableQueue.ts).

### Operational Safety

Before the first hardening change, CI built and formatted Go without running the
Go tests. Existing catalog checks and client replay tests are useful but do not
establish end-to-end migration compatibility.

Other priorities are old Go dependency pins and container tooling, database
calls without bounded operation contexts, manually applied migrations, and
building replacement software on the production machine. Logging and Sentry
already exist, but command latency, queue depth, database waits, and recovery
failures need explicit measurement.

See [CI](.github/workflows/ci.yml), [Go dependencies](server/src/go.mod),
[the Docker build](Dockerfile), [deployment instructions](AGENTS.md), and
[restart handling](server/src/restart.go).

## Language Tradeoffs

| Dimension           | Go                                                                                | TypeScript / Node.js                                                                                    | Rust                                                                                                             |
| ------------------- | --------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------- |
| Workload fit        | Excellent for concurrent connections and server-side I/O.                         | Good for turn-based, I/O-heavy applications.                                                            | Excellent technically, but more capability than the demonstrated workload requires.                              |
| Main advantage here | Preserves the complete working implementation.                                    | Can reduce duplication with the existing client and game packages.                                      | Strong ownership/type guarantees, efficient native execution, and no tracing garbage collector.                  |
| Concurrency         | Lightweight concurrent tasks; shared state requires discipline.                   | Sequential execution helps, but asynchronous operations still permit logical races.                     | Strong protection against data races; asynchronous ownership is more demanding.                                  |
| CPU-heavy work      | Uses multiple cores naturally.                                                    | Long synchronous replay or deduction work can block unrelated clients; use bounded workers when needed. | Strong option for expensive simulation or search.                                                                |
| Memory and latency  | Garbage collection and runtime overhead are usually a reasonable server tradeoff. | Allocation, garbage collection, and event-loop stalls require attention.                                | Greater control and potentially lower overhead, but not automatically faster end-to-end.                         |
| Code sharing        | Rules remain duplicated without another sharing mechanism.                        | Best direct reuse of current assets.                                                                    | WebAssembly can share a Rust engine with browsers, but requires replacing or adapting existing TypeScript logic. |
| Delivery risk       | Lowest.                                                                           | Significant migration with a credible maintenance payoff.                                               | Highest: new implementation, tooling, and integration work.                                                      |

Go and JavaScript are already memory-managed environments. Rust's safety
benefits are real, but this is not a migration away from an unsafe C server.
Consider Rust only for measured computational bottlenecks or a separately
justified engine project. It will not fix slow SQL, incorrect joins, or
oversized critical sections by itself.

## Target Architecture

The selected target is a modular Go monolith backed by PostgreSQL, with one
authoritative game engine and sequential command processing per table. Clear
internal boundaries do not require separately deployed microservices. Ownership
has been simplified incrementally, not replaced wholesale with a new actor
framework.

1. **Deterministic authoritative core.** Validated commands produce transitions
   and events. Inject time and randomness; keep networking, persistence, and
   client deductions outside the core.
2. **One writer per table.** Preserve ordering within a table without blocking
   unrelated tables. Bound queues and define behavior for slow clients and
   unavailable storage.
3. **Durable progress before acknowledgment.** Use versioned per-game
   checkpoints, command IDs, and monotonic revisions for deduplication and
   recovery. Reuse reserved game primary keys; no additional permanent
   identifier, journal, or distributed messaging platform is required.
4. **Separate authoritative state and player views.** Share rules and schemas
   with the browser, but send only information the recipient may see.
5. **Explicit compatibility boundaries.** Preserve bot APIs, historical replays,
   variant IDs, and database semantics. Version new protocols and persisted
   state where needed.
6. **Predictable operations.** Build artifacts in CI, track migrations, support
   orderly shutdown, exercise backup restoration, and measure command latency,
   database waits, and recovery failures. Measure event-loop delay if using
   Node.js.

Redis should remain optional unless it solves a demonstrated coordination or
caching need. Do not introduce it as an unexplained second source of truth for
game state.

## Delivery Sequence

### Execution Model

Work by agreed phase, not by individual edits. Within that phase, choose routine
implementation details and group related fixes and regression coverage by
outcome. The current authorization is to commit and push completed milestones
directly to `main`, without opening PRs or requesting small-step confirmation.

Run the full repository lint, formatting, and regression suites before each
push, then verify remote CI before proceeding to the next milestone. Audit the
whole codebase between milestones for unreachable code, unused exports,
refactoring opportunities, and gaps in coverage. Verify reachability findings
before deleting code; maintenance tools and external APIs need special care.

Keep dependent changes in order and do not mix unrelated hardening tasks.
Escalate blockers and material architecture decisions, not routine choices.
Deploying to production and destructive data changes require separate
authorization.

### Progress and Audit Record

- Implemented: Go race and PostgreSQL integration checks, deterministic legacy
  deck/character fixtures, Go 1.27 and Node 24 build alignment, and container
  builds and Go static analysis in CI.
- Implemented: refreshed Go web/authentication/runtime dependencies and pgx v5,
  with legacy cookie/password and engine-regression coverage. The maintenance
  server is included in CI; persisted username transliteration remains pinned.
- Implemented: incremental lifecycle ownership through admission/draining,
  cancelable timers, stale-session protection, fail-closed login initialization,
  and registered background writes. This is not a complete table-owner rewrite.
- Implemented: aggregate localhost command/recovery metrics, fixed database
  operation deadlines, tracked migrations, and startup schema checks. Database
  deadlines bound individual operations, not an entire multi-statement workflow.
- Durable recovery: versioned PostgreSQL checkpoints keyed by reserved game IDs,
  monotonic revisions, and optional per-user command IDs. Accepted gameplay,
  clocks, pauses, notes, tags, and active chat are saved before table effects.
  Recipient payloads are scrubbed and frozen before buffering. Storage failures
  freeze the affected table; restoration retains authoritative checkpoints,
  excludes downtime, reconciles legacy files, and finalizes terminal games
  idempotently. Completion atomically removes its active checkpoint along with
  committing the game, participants, actions, notes, chat, and tags. A fixed
  two-connection leaf pool permits checkpoints under only the table lock.
  Planned maintenance checkpoints the existing 20-second restart allowance;
  crash-loop restoration does not repeatedly grant it. Spectators remain
  ephemeral; chat command effects are not replayed, and derived seed/statistic
  refreshes remain best-effort. Reconnect still bootstraps state rather than
  resubmitting commands. No extra completed-game identifier or index.
- Compatibility baseline: nineteen Go-authority traces cover representative
  variants, options, command results, recipient views, recovery, and terminal
  persistence. Fifteen shared TypeScript event-projection checks pass; these do
  not establish TypeScript command authority.
- Implemented: paired CI release artifacts with checksums, bundled migrations,
  stopped-service activation, and verified signal/re-exec lifecycle. Native and
  container smoke checks cover startup, shutdown, restart, and refusal paths. A
  real PostgreSQL dump/restore regression preserves active state, command
  receipts, and reserved-ID sequence advancement.
- Implemented: an isolated TypeScript slice covering a complete standard
  two-player game, reconnect, completion, replay, deduplication, and
  process-kill recovery. It has no production routing or shared ownership of Go
  tables.
- Between-step audits: no TypeScript unused exports; eleven obsolete Go methods
  removed. Retained unreachable helpers support the disabled statistics route
  and manual repair recipes. Load evaluation also exposed and fixed WebSocket
  send/close and statistics-update races. Retained helpers are not evidence of
  live feature support in the partial TypeScript server.
- Decision: consolidate production on Go. The implementation and local
  evaluation are complete; production rollout, production capacity measurement,
  and operational acceptance remain operator-gated. No production deployment or
  migration has been performed.

### Phase 1: Strengthen Go

Deliver small, independently reviewable changes while Go remains the production
authority.

**First PR: establish the regression safety baseline.**

- Run the existing Go tests with the race detector on every CI push and pull
  request, within the existing `server_build` job.
- Disable test-result caching and set a test timeout so CI executes the suite
  and fails on hangs.
- Document the same local command for contributors.
- Keep runtime behavior, dependency versions, database schema, deployment
  procedures, and TypeScript behavior unchanged.

Acceptance: formatting and compilation still run; test failures and detected
races fail the existing server check. Unit tests need no running PostgreSQL or
Redis instance; the added database integration suite uses an isolated PostgreSQL
service in CI. Race detection covers exercised paths, not all possible
concurrency bugs. Repository branch-protection settings are outside this PR.

**Subsequent Go hardening milestones:**

1. Add focused regression scenarios for deterministic replays, reconnects,
   timers, and game completion, plus measurements of command latency and
   database waits.
2. Design and implement durable in-progress recovery with versioned storage,
   command deduplication, and explicit failure behavior. Exercise crashes before
   and after persistence, acknowledgment, and broadcast.
3. Simplify table ownership incrementally. Preserve the boundary between table
   locks and database I/O; give timers explicit cancellation and lifecycle
   ownership.
4. Introduce tracked, repeatable database migrations and bounded database
   operations. Keep changes compatible with large existing tables and rollback
   requirements.
5. Modernize toolchains and dependencies under replay compatibility coverage,
   then deploy artifacts built in CI instead of building on the running
   production machine.

Do not use a signal-based restart on the current production server. Follow the
existing graceful restart procedure in [AGENTS.md](AGENTS.md) until a
replacement recovery and shutdown design is implemented and verified.

### Phase 2: Establish Engine Compatibility

Build a representative compatibility corpus spanning variants and option
interactions. Compare deterministic deals, accepted and rejected commands,
resulting events, and each recipient's visible state. Include historical
replays, disconnects, timeouts, retries, and interrupted persistence.

Use the Go implementation as the initial behavioral reference, while documenting
intentional corrections rather than preserving bugs silently. Exercise the
harness against Go before using it to evaluate a replacement.

### Phase 3: Implement One Complete TypeScript Slice

Implement table creation, joining, a complete game, reconnecting, completion,
and replay for a deliberately bounded feature set. Reuse shared rules, but
introduce the missing authoritative command layer and recovery design.

Compare correctness, memory usage, throughput, latency, and implementation cost
against Go under representative load. Include replay-heavy and reconnect-heavy
scenarios, not only isolated HTTP benchmarks.

### Phase 4: Measured Decision and Conditional Migration

**Selected outcome: retain Go; do not begin a production TypeScript migration.**
The slice does not retire any production implementation, so it has not
demonstrated reduced maintenance work. The existing partial TypeScript server
and experimental slice are research code, not a second supported production
authority. Revisit migration only with a concrete maintenance case and full
compatibility, reliability, and capacity evidence.

The following coexistence requirements apply only if that decision changes:

Keep experimental tables opt-in. Assign each table exactly one authoritative
implementation; do not dual-write gameplay or transfer engines mid-game.

Define authentication/session compatibility, protocol routing, database
ownership, rollout, and rollback before coexistence in production. Expand the
supported feature set only after compatibility and recovery criteria are met.

If TypeScript materially reduces maintenance work and meets reliability and
capacity goals, complete the migration and retire Go. If it does not,
consolidate on improved Go instead of maintaining an indefinite partial port.

### Evaluation Evidence and Remaining Gates

Three paired local runs used the same explicit standard deck, four game lanes,
eight completed games, 200 actions, 160 replay reads, and 80 completed-game
reconnects per run. Medians of the per-run measurements:

| Metric                | Go     | TypeScript |
| --------------------- | ------ | ---------- |
| Actions/second        | 358.8  | 230.7      |
| Mixed reads/second    | 1378.2 | 547.5      |
| Action p95 (ms)       | 25.2   | 29.8       |
| Replay p95 (ms)       | 17.0   | 41.0       |
| Reconnect p95 (ms)    | 21.5   | 91.1       |
| Sampled peak RSS (MB) | 41.8   | 206.0      |

These are not production capacity estimates or a language-only comparison. Runs
were short and local, with clients in the measured server process. Go performs
fuller lifecycle/statistics work; reconnect payloads, replay query paths, pool
arrangements, and logging differ. Historical seeded replay and global lobby
routing were excluded. Action throughput ranged from 238-444/s for Go and
111-283/s for TypeScript. The refreshed Go runs logged no errors. No measured
maintenance savings offset the missing TypeScript production authentication,
clocks, spectators, variants, options, or authored metadata.

To reproduce against a disposable PostgreSQL instance, export the existing
`HANABI_TEST_DATABASE_URL` test selector and run:

```sh
(cd server/src && go test -run '^TestStandardSliceEvaluation$' -count=1 -v -evaluate-standard-slice)
TSX_DISABLE_CACHE=1 npx tsx packages/server/src/experimental/evaluate.ts
```

The TypeScript format is deliberately limited to standard two-player games with
explicit decks; it does not replace legacy Go seed generation. Recovery tests
include failed and uncertain commits, stale writers, and real process
termination. Compatibility traces are representative, not exhaustive coverage of
every variant/option interaction.

**Operator-gated work:** authorize deployment separately, verify a current
backup and restore procedure, review pending migrations and old snapshot
compatibility, then perform the stopped-service artifact transition described in
[installation instructions](docs/install.md#opt-in-ci-releases-linux-amd64).
Observe real command latency, recovery failures, pool pressure, and storage
growth before declaring production acceptance. Forward migrations and active
checkpoints prohibit casual binary rollback. Derived statistics remain
best-effort across crashes; they are not covered by a durable outbox.
