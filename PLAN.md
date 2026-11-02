# Remaining Server Rollout

Only unfinished work is listed here. Production access, migrations, and service
changes require separate authorization; permission to commit to `main` does not
authorize a production deployment.

1. **Production readiness.** Confirm the running revision, database migration
   state, available disk space, and saved-snapshot compatibility. Verify a
   current production backup by restoring it in an appropriately protected
   environment. Resolve any intermediate UUID-era snapshots before
   migration 003. Do not copy production credentials or player data into
   repository artifacts.
2. **Deploy the CI-built release.** Follow the
   [artifact installation procedure](docs/install.md#opt-in-ci-releases-linux-amd64).
   Verify the selected successful CI run and archive; use the old service's
   `/shutdown` and wait for exit. Preserve configuration and runtime state,
   apply reviewed migrations while stopped, activate the paired release, and
   start it explicitly. Never signal-stop the old source server or force-kill
   games to complete a rollout.
3. **Production acceptance.** Check readiness, logs, gameplay, reconnects,
   completion, and replays after deployment. Observe command latency, recovery
   failures, database pool pressure, and storage growth under normal traffic. Do
   not treat the local benchmark as a production capacity measurement or run
   disruptive load/crash tests against live players.
4. **Close the roadmap.** Delete this file and remove its contributor-document
   link only after rollout and operational acceptance are verified. Preserve
   deployment instructions in their existing documentation.

If a prerequisite fails, stop before the affected production operation. Forward
migrations and active checkpoints mean an older binary is not an automatic safe
rollback. Repair or rollback requires a reviewed compatibility procedure.
