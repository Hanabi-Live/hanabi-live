# TypeScript Server Parity

Implement Go-compatible behavior in the TypeScript server without deploying or
changing production. Go remains the production authority until parity is
demonstrated. The bounded experimental server is not a substitute for the normal
client protocol or full feature support.

Only unfinished work belongs in this checklist. Complete coherent milestones,
run lint and relevant regression suites, push to `main`, and verify CI. Audit
reachability and shared helpers between milestones. Do not remove intentional
maintenance paths or add speculative configuration.

- [ ] Verify CI for the final normal-server comparison and API acceptance
      changes, then delete this file and remove its contributor-document link.

Production deployment, database migrations, and live acceptance are deferred by
the user and are not completion requirements for this code-only plan.
