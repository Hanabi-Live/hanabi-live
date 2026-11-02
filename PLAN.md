# TypeScript Server Parity

Implement Go-compatible behavior in the TypeScript server without deploying or
changing production. Go remains the production authority until parity is
demonstrated. The bounded experimental server is not a substitute for the normal
client protocol or full feature support.

Only unfinished work belongs in this checklist. Complete coherent milestones,
run lint and relevant regression suites, push to `main`, and verify CI. Audit
reachability and shared helpers between milestones. Do not remove intentional
maintenance paths or add speculative configuration.

- [ ] Complete main-process startup, reconnect/disconnect table ownership, and
      graceful draining.
- [ ] Complete remaining lobby commands: table chat, chat commands and Discord
      mirroring, and typing/read indicators.
- [ ] Complete table creation, joining/leaving, ownership, updates, suggestions,
      spectating, start/restart, termination votes, and reconnect state.
- [ ] Implement authoritative gameplay for all supported player counts,
      variants, options, characters, timers, pauses, notes, tags, and recipient
      visibility. Preserve legacy seed/deck generation and replay behavior.
- [ ] Integrate durable active-game checkpoints, request deduplication, failure
      freezing, crash recovery, and atomic completed-game persistence with the
      application database. Preserve authored metadata and statistics behavior.
- [ ] Complete replay creation, shared replay controls, hypothetical actions,
      replay visibility, historical imports/exports, and bot protocol behavior.
- [ ] Complete Go-equivalent HTTP pages/APIs, administrative chat commands,
      Discord integration, maintenance, and operational metrics. Resolve
      competing table state in Redis and memory; keep one authoritative state
      owner per table.
- [ ] Exercise the actual TypeScript entry point with the existing client and
      Go-authority compatibility corpus. Cover every registered Go command and
      enabled HTTP route, unsupported-input rejection, concurrency, restart,
      storage failures, and interrupted completion. Expand fixtures where
      representative traces do not exercise a supported feature.
- [ ] Repeat comparable gameplay/replay/reconnect load measurements and document
      remaining behavioral differences. Do not claim parity from command counts
      or client event projection alone.
- [ ] Once all code and verification tasks pass CI, delete this file and remove
      its contributor-document link.

Production deployment, database migrations, and live acceptance are deferred by
the user and are not completion requirements for this code-only plan.
