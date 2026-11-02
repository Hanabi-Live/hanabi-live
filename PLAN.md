# TypeScript Server Parity

Implement Go-compatible behavior in the TypeScript server without deploying or
changing production. Go remains the production authority until parity is
demonstrated. The bounded experimental server is not a substitute for the normal
client protocol or full feature support.

Only unfinished work belongs in this checklist. Complete coherent milestones,
run lint and relevant regression suites, push to `main`, and verify CI. Audit
reachability and shared helpers between milestones. Do not remove intentional
maintenance paths or add speculative configuration.

- [ ] Integrate application-wide command admission, graceful draining, and
      process signals with operational shutdown and restart.
- [ ] Complete remaining lobby commands: chat commands and Discord mirroring,
      and typing/read indicators.
- [ ] Complete pregame spectating, table restart, termination votes, automatic
      spectator handoff, and spectator note writes.
- [ ] Complete pregame/replay/typing/countdown timers and the development-mode
      idle exemption. Preserve legacy seed/deck generation and replay behavior.
- [ ] Complete replay creation, shared replay controls, hypothetical actions,
      replay visibility, historical imports/exports, and bot protocol behavior.
- [ ] Complete administrative chat commands, maintenance, and operational
      metrics. Finish HTTP transport parity, including HTTPS redirection and
      certificate renewal, and evaluate configured telemetry integrations.
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
