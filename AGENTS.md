# AGENTS.md

## Configuration and customization

Do not add environment variables, configuration options, or customization unless
they are absolutely necessary or there is a strong, concrete reason. Prefer a
simple, documented behavior over speculative flexibility. When a new option is
justified, explain the use case and why a fixed behavior is insufficient.

## Documentation

Do not document every small change or implementation detail. Add or update
documentation only for essential instructions, significant decisions, or
non-obvious constraints. Keep it concise and relevant to the document's purpose;
do not put unrelated operational details in installation instructions.

## Before pushing

Use Bun for JavaScript dependency management; its version is pinned in the root
`package.json`. Use `bun install --frozen-lockfile`, `bun run <script>`, and
`bunx --bun --no-install <tool>`. Bun is also the JavaScript runtime. Commit
`bun.lock`, not an npm lockfile. `bun run test` prepares native integration
backends and runs the migrated suites with Bun's native test runner and per-file
isolation. Keep automatic `.env` loading disabled in `bunfig.toml`; applications
and build scripts manage their own configuration.

Never add inline CSpell word lists, ignores, or disable directives to files. Add
legitimate project vocabulary to the `words` list in `cspell.config.jsonc`
instead.

Run the full repository linting suite from the repository root before every
push:

```sh
bash lint.sh
```

This is the same entrypoint CI uses for TypeScript checks, Go vet, Rust
formatting/Clippy, Prettier, spelling, ShellCheck, and repository consistency.
CI runs complementary shards; run the no-argument command above before pushing.
It requires Bun, the repository's JavaScript dependencies, Go/Rust toolchains,
and ShellCheck, but no running PostgreSQL or Redis services.

Run it against the final changes, even if package-specific checks already
passed. Fix any failures and rerun the full suite before pushing. If a required
check cannot run or still fails, report the blocker instead of pushing. Run the
relevant tests and builds as well; passing lint does not replace those checks.

## Wire contracts

Migrated public payloads are owned by `experimental/rust-server/protocol`,
without database, actor, or game-engine dependencies. Update the Rust DTOs and
shared compatibility fixtures, then run
`bash scripts/bash/generate_protocol.sh`. Commit the generated TypeScript file;
do not edit it by hand. `bash lint.sh` checks for generation drift. Keep legacy
compatibility differences explicit.

## Production server

The production server is `root@hanab.live`, with the repository at
`~/hanabi-live`. The server log is at `~/hanabi-live/logs/hanabi-live.log` (use
`./get-log.sh` to download it).

### Current Rust deployment

For the current source-layout Rust installation, `./deploy_rust.sh --check`
downloads and verifies the approved release for current `main` without
deploying. Run `./deploy_rust.sh` to publish and gracefully restart; reviewed
pending migrations require `--apply-migrations`. It requires an
artifact-readable `GH_TOKEN` or `GITHUB_TOKEN_PERSONAL_CLASSIC`, Python 3.12+,
Git, and PostgreSQL client tools, not Node, Bun, Cargo, or the GitHub CLI. It
fast-forwards the clean checkout without dependency-install hooks and retains
deployment records and overwritten-file backups in `backups/deploy-rust-*`.
These file backups do not replace coordinated PostgreSQL/Redis backups. Never
automatically roll back an interrupted deployment; inspect its recorded phase
and recovery state first.

Production now runs the native Rust binary at `~/hanabi-live/hanabi-live`. Use a
successful CI Rust release with its paired client assets, verify it with
`/opt/hanabi-python/bin/python3` and the bundled `install/release.py`, and run
`--check-startup` against the staged configuration before publication. Publish
assets atomically, install the replacement binary through a sibling file and
rename, then request `/gracefulRestart`. Rust does not build code during that
operation. Verify the served revision and recovery health afterward.

Release builds run in parallel with validation. Artifacts prefixed `candidate-`
are unapproved build outputs, not deployment releases. Only
`publish_native_release` publishes the normal release artifact names after all
required checks succeed.

Rust currently loads the client version at startup. A new client version needs a
Rust graceful restart; do not apply the Go-only asset deployment procedure below
unchanged.

Live state is authoritative in the separate `hanabi-redis.service`, using
`redis+unix:///run/hanabi-redis/redis.sock`, with persistence in
`/var/lib/hanabi-redis`. Do not delete that data or use the unrelated legacy
Redis service. `database_backup.sh` backs up PostgreSQL only: recovery also
requires Redis state and cross-store consistency. Retain coordinated cutover
backups and the Go restart-blocking marker. Do not restart Go against a
post-cutover database or assume a binary rollback can convert live state.

Production validation must exercise authenticated browser traffic against
production-sized data, including sparse histories, users without friends,
HTTP/2, all supported host names, and simultaneous reconnects. A successful
checkpoint import or anonymous health request alone is not sufficient.

Legacy Go reused table IDs, so a `chat_log` room such as `table123` can contain
unrelated historical messages. Capture diagnostic chat row IDs and delete only
those exact IDs after verifying ownership. Never clean up chat by room or source
alone.

### Deploying Go from source (legacy/reference)

The existing production installation uses this procedure. Opt-in CI artifact
installations have a separate
[deployment lifecycle](docs/install.md#opt-in-ci-releases-linux-amd64); do not
mix the two procedures.

**Do not restart the Go server for a client-only deployment.** Choose the
deployment procedure from the actual diff and the runtime that consumes it, not
from the fact that a new commit exists.

#### Classify the change before deploying

Inspect production's clean/dirty worktree, running service, deployed client
revision, target commit, and intervening changes. Useful commands on the server:

```sh
cd ~/hanabi-live
git status --short
supervisorctl status hanabi-live
cat public/js/bundles/git_revision.txt
git fetch origin
git log --format="%h %s" HEAD..origin/main
git diff --stat HEAD..origin/main
df -h /
```

The checkout, client assets, and running Go binary may represent different
commits. Read the running revision from the startup log or the running binary's
Go build metadata; do not assume that `git rev-parse HEAD` describes the running
process. Compare against the relevant deployed revision, including earlier
changes pulled but not yet built or restarted.

| Change                                                                                                        | Required action                                                                                                            |
| ------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------- |
| Browser-only TypeScript/React, CSS, fonts, images, or client build changes compatible with the running server | Build and publish client assets; **no server restart**.                                                                    |
| Go-rendered HTML templates only, with unchanged handler/data contracts                                        | Publish compatible templates/assets; **no server restart**. Go parses these templates for each request.                    |
| Go runtime code, Go dependencies, HTTP/WebSocket handlers, or startup configuration                           | Build and deploy Go using the graceful restart procedure below.                                                            |
| Shared rules, protocol schemas, or variant/suit JSON                                                          | Trace consumers first. Data loaded by Go at startup or changes requiring matching server behavior are **not client-only**. |
| Rust server changes while running the Go reference server                                                     | Do not restart Go solely for changes to an inactive implementation. Check for shared runtime changes.                      |
| Documentation, tests, or scheduled shell scripts only                                                         | Publish the changed files as appropriate; do not rebuild clients or restart Go merely to advance the checkout.             |

For mixed changes, follow the procedure required by the affected running server.
A `.ts` extension does not establish that something is browser-only, and a
user-facing bug fix can still require a Go change. Verify rather than guessing.

#### Client-only deployment: keep the server running

1. Confirm the target's relevant checks pass and that it requires neither a
   running-server change nor a migration. Record the current PID, client
   revision, and asset version. Preserve existing worktree changes.
1. Check disk headroom and retain a small rollback copy of the deployed client
   assets and metadata. Do not create a full plaintext database dump for a
   frontend deployment.
1. Prepare the target commit in a staging checkout/worktree with full Git
   history. Use compatible installed dependencies; if the dependency manifest or
   lockfile changed, prepare dependencies there with
   `bun install --frozen-lockfile`. Ensure the installed Node/Bun toolchain is
   available in the non-interactive shell.
1. Build **both** clients from the repository root in staging:

   ```sh
   CI=1 bash packages/client/build_client.sh
   ```

   This builds the classic game/lobby bundle, CSS, pips reference, new React
   lobby, and prototype entry. Here `CI=1` only avoids sourcing the production
   `.env` for the client build. It does not run tests.

   Do not build just `packages/client-new` for a new commit: both clients bake
   in the Git commit-count version, and the login endpoint checks the version
   recorded in `public/js/bundles/version.txt`.

1. Inspect the staged output and test the affected UI. **Do not run the client
   build directly against live assets for this deployment path.** The classic
   build removes old versioned files, and Vite empties `public/client-new`; an
   in-place build can leave browsers with missing files or a partially updated
   release if a later build step fails.
1. Publish the staged assets without deleting the previous versioned files. Copy
   new versioned JS/CSS, hashed chunks, fonts, and other referenced assets
   first. Replace files through temporary sibling files and atomic renames,
   rather than writing directly into files that HTTP requests may be reading. Do
   not use a destructive directory sync that removes old chunks still referenced
   by open tabs.
1. Fast-forward the production checkout to the verified target
   (`git pull --ff-only`, checking the resulting SHA). If templates changed,
   ensure their referenced assets exist before making the templates visible.
   Publish HTML entrypoints and unversioned bundles after their dependencies,
   then publish matching build metadata. Switch `public/js/bundles/version.txt`
   last, only after both clients are ready.
1. Verify the served HTML, its referenced JS/CSS/chunks, and the affected UI in
   a browser. Check `/new`, `/lobby`, and the existing game handoff when
   affected. Confirm the PID is unchanged and inspect logs for new errors.
   Existing games and WebSockets must not be intentionally disconnected.

For client-only changes, **do not call `/gracefulRestart` or `/shutdown`, build
or replace the Go executable, or restart Supervisor**. The running Go server
reads `version.txt` on demand (`getVersion` in `server/src/misc.go`) and serves
the new lobby's HTML from disk, so new page loads can receive the updated client
without restarting the process.

Existing tabs keep their already-loaded JavaScript until refreshed; do not force
players out of a game to update it. The startup log's Go revision will remain
unchanged after a client-only deploy, and that is expected. If client
publication fails, restore the matching asset entrypoints/version metadata from
the rollback copy without restarting an otherwise healthy server.

#### Go/server deployment: graceful restart required

1. Verify the target and its checks, record the current runtime/client
   revisions, check disk headroom, and back up the existing binary and assets.
1. Prepare builds and any changed dependencies away from live assets before
   scheduling the restart. Confirm migration requirements.
1. Pull the verified code on the server: `git pull --ff-only`.
1. Check pending SQL migrations with `./install/migrate.sh status`; apply
   pending migrations with `./install/migrate.sh apply` before new code needs
   them. Follow the large-table precautions below.
1. Gracefully restart the server, using the configured local control port:

   ```sh
   (source .env && curl --fail --show-error \
     "http://127.0.0.1:${LOCALHOST_PORT:-8081}/gracefulRestart")
   ```

   This builds the client and the server, checkpoints ongoing games, warns
   players, and restarts. The games are restored when the server starts back up.
   The endpoint returns before that work finishes; an HTTP success response
   alone does not prove deployment succeeded.

1. Verify the new PID and running Go revision, the "successfully started" log
   message, restored games/checkpoint progress, client assets, HTTP/browser
   health, available disk space, and absence of new application errors.

**Never use `supervisorctl restart` or `supervisorctl stop` (or
`restart_service_only.sh`) on a running server.** Signals bypass command
draining and orderly finalization; continuous recovery is not a replacement for
maintenance shutdown. Use `/gracefulRestart` to restart or `/shutdown` to stop.
`supervisorctl start` is only appropriate when the server is already stopped.

### Database migrations

The temporary Go-to-Rust live-game cutover is documented in
`experimental/rust-server/README.md`. Its bridge, endpoint/startup marker, and
cutover-specific tests must be removed after the permanent Rust switch.

Use `./install/migrate.sh status` to inspect migration state and
`./install/migrate.sh apply` to apply pending migrations before restarting. The
runner uses pinned Tern and the project's Go 1.27 toolchain, and reuses the
existing `.env` database settings. It does not apply migrations during server
startup.

Before migration `003_reserved_game_ids.sql`, finish games and resolve saved
snapshots from the intermediate UUID-based server. It removes that column and
index; those snapshots cannot be restored afterward. Original unversioned
snapshots are upgraded automatically. Do not roll back to a server without
reserved-ID support while such games are in progress.

Migration `004_active_games.sql` is required for continuous game recovery. Do
not roll back to a binary without active-game recovery while checkpoints exist.
PostgreSQL checkpoints supersede flat snapshots and survive restoration. The
retired `/saveTables` endpoint returns HTTP 410 without saving anything; use
`/gracefulRestart`, which checkpoints the active timed player's 20-second
maintenance allowance once. Crash restoration does not grant additional time. A
failed or uncertain checkpoint freezes only that table until server recovery.
Keep using graceful restart, including when recovering frozen tables.

Keep migration files numbered consecutively from `001_name.sql`. Applied
migrations are immutable: do not edit or delete them. Use forward migrations
only, without a down-migration section. Update `install/database_schema.sql` in
the same change; fresh installations record the version already represented by
that complete schema.

Migrations normally run in transactions. Operations such as concurrent index
creation require `---- tern: disable-tx ----` and must be designed for safe
recovery after partial failure.

Some tables, such as `chat_log` (~90 million rows), are very large:

- Adding a nullable column, or a column with a constant default, is instant and
  safe to run while the server is online.
- An `UPDATE` of every row takes a long time, roughly doubles the table's disk
  usage, and (when combined with `ALTER TABLE` in one transaction) locks the
  table for the whole duration. Instead, backfill in small batches by ID range
  with `VACUUM` in between, while the server is online.
- Add `CHECK` constraints with `NOT VALID` and then `VALIDATE CONSTRAINT`, which
  does not block reads or writes.
