# AGENTS.md

## Configuration and customization

Do not add environment variables, configuration options, or customization unless
they are absolutely necessary or there is a strong, concrete reason. Prefer a
simple, documented behavior over speculative flexibility. When a new option is
justified, explain the use case and why a fixed behavior is insufficient.

## Constants

Name a limit, timeout, or protocol value once and refer to it everywhere,
including in error messages that state it. Derive related values (such as
`MAX_DECK_SIZE + 1`) instead of writing the result. Put values shared with
clients or the game catalog in `server/protocol`. A literal used once whose
meaning is obvious from context can stay inline.

## Documentation

Default to no documentation changes. Update prose only when explicitly requested
or when existing instructions would otherwise become incorrect or unusable. A
code change is not, by itself, a reason to add documentation.

Before adding documentation, identify the concrete reader action it enables. If
there is none, put the explanation in the commit or pull request instead. Do not
use documentation as a changelog or a place to narrate implementation details,
internal data flow, CI behavior, or build metadata.

Keep installation instructions limited to the steps and configuration needed to
install and run the server. When a command changes, update that command rather
than adding paragraphs explaining the implementation behind it.

## When to add tests

Do not add tests for scripts or operational tooling, including installation,
deployment, migrations, backups, build helpers, and lint/cache utilities,
regardless of language. Use existing linters and direct checks instead.

Add application tests only for meaningful behavior changes or bug fixes. Keep
them focused and avoid redundant coverage.

## Browser testing

Chromium is the only supported browser and browser-test target. Do not add tests
or audit requirements for Firefox, WebKit, or other browsers.

When authenticated browser checks need test accounts, use the existing shared
accounts: `test` / `test`, `test2` / `test2`, and so on (username / password).
Choose an account that is not already in use. Do not change these accounts'
passwords or delete them during cleanup. Keep test interactions confined to test
accounts and their own tables.

When driving a browser, mute its audio (for Chromium, `--mute-audio`) unless you
are debugging sound.

## Delivering changes

After making changes, complete the required checks, commit, and push
automatically. In the primary checkout on `main`, push directly to `main`. In a
linked worktree, on any other branch, or with detached HEAD, push a feature
branch and open a pull request against `main` instead. Create a feature branch
first if detached or on `main` in a linked worktree. Update an existing pull
request for that branch rather than opening a duplicate. Include only changes
for the task; do not commit unrelated work.

Always rebase local commits onto upstream changes instead of creating merge
commits. If a push is rejected because the remote branch advanced, fetch and
rebase the commits not yet pushed, then rerun the required checks before
pushing. Preserve unrelated working-tree changes. Do not force-push `main` or
rewrite published history to apply this rule.

When a pull request is merged, clean up after yourself: in a linked worktree,
run `git fetch` and `git switch --detach origin/main`, then delete the merged
local branch.

Use Conventional Commits for commit messages:
`type(optional-scope): description`, for example
`fix(client): clear stale spectators` or `docs: update setup instructions`.

## Before pushing

Use `GITHUB_TOKEN` for GitHub CLI authentication:
`GH_TOKEN="$GITHUB_TOKEN" gh <command>`. If it is empty, source `~/.env` first:
`( set -a; source ~/.env; set +a; GH_TOKEN="$GITHUB_TOKEN" gh <command> )`. Do
not print or commit the token.

Use Bun for JavaScript dependency management; its version is pinned in the root
`package.json`. Use `bun install --frozen-lockfile`, `bun run <script>`, and
`bunx --bun --no-install <tool>`. Bun is also the JavaScript runtime. Commit
`bun.lock`, not an npm lockfile. `bun run test` runs the client tests with
Vitest, then prepares native integration backends and runs the other suites with
Bun's native test runner and per-file isolation. It starts a disposable
PostgreSQL server, which needs `initdb` and `postgres` on `PATH` (or set
`HANABI_TEST_DATABASE_URL` to one), and the integration suites need
`redis-server` on `PATH`. Keep automatic `.env` loading disabled in
`bunfig.toml`; applications and build scripts manage their own configuration.

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
Clippy, Prettier, spelling, ShellCheck, and repository consistency. CI runs the
JavaScript and Rust checks in separate jobs; run the no-argument command above
before pushing. It requires Bun, JavaScript dependencies, the pinned Rust
toolchain, and ShellCheck, but no running PostgreSQL or Redis services.

Run it against the final changes, even if package-specific checks already
passed. Fix any failures and rerun the full suite before pushing. If a required
check cannot run or still fails, report the blocker instead of pushing. Run the
relevant tests and builds as well; passing lint does not replace those checks.

The root lint entrypoint caches package lint scripts in Turborepo's local
`.turbo/cache`; CI restores results from trusted `main` runs. Source changes
invalidate dependent packages through transit tasks. Keep shared lint
configuration in `turbo.json` inputs. The generated client version stays outside
the cache inputs: lint uses its tracked type declaration, not its changing
runtime value. Rust and repository-wide checks still run normally. To bypass
package caching, run
`bunx --bun --no-install turbo run lint --force --cache=local:rw`.

## Server and wire contracts

Report failures with the operation, a safe typed cause, and a diagnostic ID
using `server/src/errors.rs`. Preserve actionable details in clients; do not
replace them with generic errors. Never expose raw SQL, credentials, private
payloads, or arbitrary exception strings through public errors or telemetry.

The production server is Rust in `server/`; its binary is `hanabi-live`.
`server/engine` owns native game rules. The Go toolchain is used only to build
the pinned third-party Tern migration tool for source installations and release
bundles.

`server/protocol` owns every JSON payload exchanged between the server and its
clients, and the format of the game catalog in `packages/game/src/json`. It has
no database, actor, or game-engine dependencies. Clients use only the generated
schemas and their inferred types; do not hand-write TypeScript interfaces for
these payloads. Update the Rust DTOs (and the shared compatibility fixtures when
a change relies on a rule they do not cover), then run
`bash scripts/dev/generate-protocol.sh`. Commit the generated TypeScript files;
do not edit them by hand. `bash lint.sh` checks for generation drift. Keep
legacy compatibility differences explicit.

## Production server

You can SSH to the production server with `ssh root@hanab.live`. The server runs
as the `hanabi` user from `/home/hanabi/hanabi-live`, using the `hanabi-live`
systemd service. Read its log with `journalctl --unit=hanabi-live`.

To deploy a new copy of the client code or the server code to production, run
`./deploy.sh` from your laptop, which uses SSH to connect and run the necessary
commands. If needed, you can inspect that file for more information.

(A new client version requires a graceful restart even if only TypeScript
changed.)

Live state is authoritative in `hanabi-redis.service`, using
`redis+unix:///run/hanabi-redis/redis.sock`, with persistence in
`/var/lib/hanabi-redis`. Do not delete that data or use the unrelated legacy
Redis service. `database-backup.sh` backs up PostgreSQL only: recovery also
requires Redis state and cross-store consistency. Keep the Redis endpoint,
database identity, and namespace stable. A binary rollback cannot convert live
state to another format.

**Never use `systemctl restart` or `systemctl stop` on a running game server.**
Use `/gracefulRestart` to restart, `/gracefulStop` to stop immediately while
preserving active games for recovery. Verify a successful process exit before
maintaining storage; a successful HTTP response only acknowledges the request.
`systemctl start` is only appropriate when the server is already stopped. An
HTTP success response does not prove a graceful restart has finished: verify the
new PID, running revision, restored tables, client assets, and logs.

## Database migrations

Use `./install/migrate.sh status` to inspect migration state and
`./install/migrate.sh apply` to apply pending migrations before restarting. We
use the Tern tool to handle migrations. The runner reuses existing `.env`
database settings. Migrations never run automatically during server startup.

The supported migration baseline is recorded in
`install/migrations/baseline.txt`. Do not edit applied SQL; retire it only with
an explicit baseline change. Keep new files numbered consecutively after the
baseline, use forward migrations without a down-migration section, and update
`install/database_schema.sql` in the same change. Fresh installations record the
current schema version. Older databases must reach the baseline using an earlier
release before upgrading.

Once a migration has been applied to production and verified working, retire it:
delete its file, raise `install/migrations/baseline.txt` to its number, and
remove code and tests that only support the older schema. The schema version
stays the same.

Migrations normally run in transactions. Operations such as concurrent index
creation require `---- tern: disable-tx ----` and safe recovery after partial
failure.

Some tables (such as `chat_log`) are very large:

- Adding a nullable column or a constant default is safe while the server is
  online.
- Do not update every row in one transaction. Backfill in small ID batches with
  `VACUUM` between batches; plan lock duration and disk headroom.
- Add `CHECK` constraints with `NOT VALID`, then `VALIDATE CONSTRAINT` without
  blocking normal reads and writes.
