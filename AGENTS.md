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

## Browser testing

When authenticated browser checks need test accounts, use the existing shared
accounts: `test` / `test`, `test2` / `test2`, and so on (username / password).
Choose an account that is not already in use. Do not change these accounts'
passwords or delete them during cleanup. Keep test interactions confined to test
accounts and their own tables.

## Delivering changes

After making changes, complete the required checks, commit, and push
automatically. In the primary checkout on `main`, push directly to `main`. In a
linked worktree, on any other branch, or with detached HEAD, push a feature
branch and open a pull request against `main` instead. Create a feature branch
first if detached or on `main` in a linked worktree. Update an existing pull
request for that branch rather than opening a duplicate. Include only changes
for the task; do not commit unrelated work.

Use Conventional Commits for commit messages:
`type(optional-scope): description`, for example
`fix(client): clear stale spectators` or `docs: update setup instructions`.

## Before pushing

Use `GITHUB_TOKEN_PERSONAL_CLASSIC` for GitHub CLI authentication:
`GH_TOKEN="$GITHUB_TOKEN_PERSONAL_CLASSIC" gh <command>`. Do not print or commit
the token.

Use Bun for JavaScript dependency management; its version is pinned in the root
`package.json`. Use `bun install --frozen-lockfile`, `bun run <script>`, and
`bunx --bun --no-install <tool>`. Bun is also the JavaScript runtime. Commit
`bun.lock`, not an npm lockfile. `bun run test` prepares native integration
backends and runs the migrated suites with Bun's native test runner and per-file
isolation. Keep automatic `.env` loading disabled in `bunfig.toml`; applications
and build scripts manage their own configuration.

External dependency versions belong in the root `package.json`
`workspaces.catalog`. Reference them with `catalog:` in package manifests; use
`workspace:*` for local packages. `bun run update` updates the catalog while
honoring `package-metadata.json` version locks. Use `bun pm pack` or
`bun publish` for the game library so catalog references are replaced with
normal versions in the published manifest.

Never add inline CSpell word lists, ignores, or disable directives to files. Add
legitimate project vocabulary to the `words` list in `cspell.config.jsonc`
instead.

Run the full repository linting suite from the repository root before every
push:

```sh
bash lint.sh
```

This is the same entrypoint CI uses for TypeScript checks, Rust formatting and
Clippy, Prettier, spelling, ShellCheck, and repository consistency. CI runs
complementary shards; run the no-argument command above before pushing. It
requires Bun, JavaScript dependencies, the pinned Rust toolchain, and
ShellCheck, but no running PostgreSQL or Redis services.

Run it against the final changes, even if package-specific checks already
passed. Fix any failures and rerun the full suite before pushing. If a required
check cannot run or still fails, report the blocker instead of pushing. Run the
relevant tests and builds as well; passing lint does not replace those checks.

The root lint entrypoint caches package lint scripts in Turborepo's local
`.turbo/cache`; CI restores results from trusted `main` runs. Source changes
invalidate dependent packages through transit tasks, including the game
package's imported server compatibility fixtures. Keep shared lint configuration
in `turbo.json` inputs. The generated client version stays outside the cache
inputs: lint uses its tracked type declaration, not its changing runtime value.
Rust and repository-wide checks still run normally. To bypass package caching,
run `bunx --bun --no-install turbo run lint --force --cache=local:rw`.

## Server and wire contracts

Report failures with the operation, a safe typed cause, and a diagnostic ID
using `server/src/errors.rs`. Preserve actionable details in clients; do not
replace them with generic errors. Never expose raw SQL, credentials, private
payloads, or arbitrary exception strings through public errors or telemetry.

The production server is Rust in `server/`; its binary is `hanabi-live`.
`server/engine` owns native game rules. Historical Go-generated compatibility
fixtures remain in `server/testdata`, but there is no Go application server. The
Go toolchain is used only to build the pinned third-party Tern migration tool
for source installations and release bundles.

Migrated public payloads are owned by `server/protocol`, without database,
actor, or game-engine dependencies. Update the Rust DTOs and shared
compatibility fixtures, then run `bash scripts/bash/generate_protocol.sh`.
Commit the generated TypeScript file; do not edit it by hand. `bash lint.sh`
checks for generation drift. Keep legacy compatibility differences explicit.

## Production server

The production server is `root@hanab.live`, with the repository at
`~/hanabi-live`. The server log is at `~/hanabi-live/logs/hanabi-live.log` (use
`./get-log.sh` to download it).

Run `./deploy_rust.sh` from your laptop; it always uses SSH to deploy the
source-layout installation at `root@hanab.live:/root/hanabi-live`.
`./deploy_rust.sh --check` downloads and verifies the approved release for
current `main` without deploying. `./deploy_rust.sh` publishes and gracefully
restarts; reviewed pending migrations require `--apply-migrations`. Both wait up
to five minutes for `publish_native_release` on the selected `main` revision's
latest CI run attempt and refuse deployment if publication fails or times out.
Container builds and documentation deployment do not gate release publication or
deployment. The laptop needs Bash and SSH. Production requires an
artifact-readable `GH_TOKEN` or `GITHUB_TOKEN_PERSONAL_CLASSIC`, Python 3.12+,
Git, and PostgreSQL client tools, not Node, Bun, Cargo, or the GitHub CLI. The
wrapper forwards the first nonempty local `GH_TOKEN`,
`GITHUB_TOKEN_PERSONAL_CLASSIC`, or `GITHUB_TOKEN` through encrypted SSH input
for that deployment only. Without a local token, it uses the remote login-shell
environment. For direct execution on production, run
`/opt/hanabi-python/bin/python3 install/deploy_rust.py` from `~/hanabi-live`
with the same flags. It fast-forwards the clean checkout without
dependency-install hooks and retains deployment records and overwritten-file
backups in `backups/deploy-rust-*`.

After an SSH disconnect, the deployment outcome is unknown; do not automatically
retry. Never automatically roll back an interrupted deployment. Inspect its
recorded phase and recovery state first. File backups do not replace coordinated
PostgreSQL and Redis backups. The importer is retired, not a way to roll back.

Production runs `~/hanabi-live/hanabi-live`. Use a successful CI release with
its paired client assets, verify it with `/opt/hanabi-python/bin/python3` and
the bundled `install/release.py`, and run `--check-startup` against staged
configuration before publication. Publish assets atomically and install the
replacement binary through a sibling file and rename, then request
`/gracefulRestart`. Rust does not build code during that operation. Verify the
served revision and recovery health afterward.

Release builds run in parallel with validation. Artifacts prefixed `candidate-`
are unapproved build outputs, not deployment releases. Only
`publish_native_release` publishes normal release artifact names after all
required checks succeed. The `hanabi-live-rust-*` artifact names are retained
for compatibility with the installed deployment tooling.

Rust loads the client version at startup. A new client version requires a
graceful restart even if only TypeScript changed. Prepare both clients away from
live assets using `CI=1 bash packages/client/build_client.sh`; do not run a
destructive client build against served assets. Keep prior versioned assets
available to existing tabs and do not force players out of games to refresh.

Live state is authoritative in `hanabi-redis.service`, using
`redis+unix:///run/hanabi-redis/redis.sock`, with persistence in
`/var/lib/hanabi-redis`. Do not delete that data or use the unrelated legacy
Redis service. `database_backup.sh` backs up PostgreSQL only: recovery also
requires Redis state and cross-store consistency. Keep the Redis endpoint,
database identity, and namespace stable. A binary rollback cannot convert live
state to another format.

**Never use `supervisorctl restart` or `supervisorctl stop` on a running game
server.** Use `/gracefulRestart` to restart, `/gracefulStop` to stop immediately
while preserving active games for recovery, or `/shutdown` for scheduled
shutdown that eventually terminates unfinished games. Verify a successful
process exit before maintaining storage; a successful HTTP response only
acknowledges the request. `supervisorctl start` is only appropriate when the
server is already stopped. An HTTP success response does not prove a graceful
restart has finished: verify the new PID, running revision, restored tables,
client assets, and logs.

Production validation must exercise authenticated browser traffic against
production-sized data, including sparse histories, users without friends,
HTTP/2, all supported host names, and simultaneous reconnects. Anonymous health
requests alone are not sufficient.

Legacy Go reused table IDs, so a `chat_log` room such as `table123` can contain
unrelated historical messages. Capture diagnostic chat row IDs and delete only
those exact IDs after verifying ownership. Never clean up chat by room or source
alone.

## Database migrations

Use `./install/migrate.sh status` to inspect migration state and
`./install/migrate.sh apply` to apply pending migrations before restarting.
Source installations use pinned Tern with Go 1.27; immutable releases include
the compiled migration tool. The runner reuses existing `.env` database
settings. Migrations never run automatically during server startup.

Applied migrations are immutable: do not edit or delete them. Keep new files
numbered consecutively from `001_name.sql`, use forward migrations without a
down-migration section, and update `install/database_schema.sql` in the same
change. Fresh installations record the schema version already represented by
that complete schema.

Legacy `active_games` records and unsupported Redis checkpoints remain
startup-blocking. Recover them with a compatible earlier release; do not delete
them to make startup pass. No schema or persisted-state format changes are
implied by moving Rust into `server/`.

Migrations normally run in transactions. Operations such as concurrent index
creation require `---- tern: disable-tx ----` and safe recovery after partial
failure.

Some tables, such as `chat_log` (~90 million rows), are very large:

- Adding a nullable column or a constant default is safe while the server is
  online.
- Do not update every row in one transaction. Backfill in small ID batches with
  `VACUUM` between batches; plan lock duration and disk headroom.
- Add `CHECK` constraints with `NOT VALID`, then `VALIDATE CONSTRAINT` without
  blocking normal reads and writes.
