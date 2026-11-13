# AGENTS.md

## Starting work

When you receive a prompt:

- If you are not in a worktree, switch to the "main" branch and run `git pull`.
- If you are in a a worktree, switch to detached HEAD and then run `git fetch`
  and `git merge --ff-only origin/main`.

Then, delete any local branches that do not exist on the remote.

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

## Styling

Style React components with Tailwind utility classes (with the `tw:` prefix),
not with new rules in `public/css`. Use the theme colors that
`packages/client/src/tailwind.css` maps from `public/css/tokens.css` (such as
`tw:bg-surface`), so that both themes work. The game screens are the exception:
they look the same in both themes, so the redesigned game screen ("New UI") uses
the `--game-screen-*` tokens, which the dark theme does not change. When a
screen moves to React, delete the stylesheet rules that only that screen used.

Do not use the HTML `title` attribute for tooltips. The browser draws it as a
plain box that does not match the site's tooltips. Use the site's tooltip
instead. In React components, pass `tooltipRef("text")` (or `tooltipRefHtml` for
HTML) from `packages/client/src/tooltipRef.ts` as the element's `ref`.

When a shape joins two parts, such as a box and its arrow, draw its outline
around the joined shape, not around each part. Otherwise the outline breaks
where the parts meet. Check the joint in a zoomed screenshot.

Before you design a new button or animation for the New UI, load the
`frontend-design`, `game-feel`, and `game-ui-ux` skills, and follow them.

Every animation plays unless the player turns on the "Reduced motion" setting
(`globals.settings.reducedMotion`). It leaves out only animations that decorate
the game, never movement that shows what happened on a turn, such as a card
moving. Do not read the operating system's reduced-motion preference
(`prefers-reduced-motion` in CSS or `matchMedia`, or Tailwind's
`tw:motion-reduce:`). Players turn it on to make their system faster, but they
still want to see the animations in the game.

## Writing style

Write prose for people (replies, commit messages, pull request descriptions,
code comments, and documentation) about 80% of the way to ASD-STE100 Simplified
Technical English, as Andrej Karpathy recommends: short sentences, one idea per
sentence, active voice, and common words that have one meaning. Keep technical
names, such as identifiers, commands, and error messages, exact.

## Documentation

Default to no documentation changes. Update prose only when explicitly requested
or when existing instructions would otherwise become incorrect or unusable. A
code change is not, by itself, a reason to add documentation.

Before adding documentation, identify the concrete reader action it enables. If
there is none, put the explanation in the commit or pull request instead. Do not
use documentation other than `docs/changelog.md` as a changelog, or as a place
to narrate implementation details, internal data flow, CI behavior, or build
metadata.

When a change adds, removes, or changes something that players or server
operators notice, add a one-line entry for it under today's date in
`docs/changelog.md` (dates newest first, such as `## November 8th, 2026`), in
the same commit. Add the entry at the bottom of that date's list. Do not add
entries for bug fixes, refactors, tests, CI, or other internal changes.

When a change adds, removes, or changes a feature of the website, update
`docs/features.md` to match, in the same commit.

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

To see or check the site's screens, use `bun run ui-screenshots`. Do not write a
separate browser script. The command starts this checkout's server with a
disposable database and seeded games, tables, and chat. It saves a screenshot of
each state at several widths in both themes to `dist/ui-screenshots`. Use
`--state`, `--width`, and `--theme` to take fewer screenshots. For a CSS change,
add `--compare <git ref>`: it reports every computed style that differs from the
stylesheets of that ref. If a screen or state that you need is missing, add it
to `packages/testing/src/uiScreenshots.ts`. Keep one state for each screen or
main element. Do not commit a state that only checks one change, such as a
variant of a screen that another state shows.

To show an animation, show a video, not still frames. Give the state a `record`
step that starts the animation and waits for it to end. The command then saves a
video of that step to `dist/ui-screenshots/<state>.webm`.

When other authenticated browser checks need test accounts, use the existing
shared accounts: `test` / `test`, `test2` / `test2`, and so on (username /
password). Choose an account that is not already in use. Do not change these
accounts' passwords or delete them during cleanup. Keep test interactions
confined to test accounts and their own tables.

When driving a browser, mute its audio (for Chromium, `--mute-audio`) unless you
are debugging sound.

When you port a legacy screen or element to React, it must still look almost the
same. Before the change, take detailed screenshots of every state that the port
touches, at every width and in both themes. Take them again after the change,
and compare each pair. Fix every difference that is more than a pixel or two.
Also run `--compare <git ref>` against the commit before the port. Report the
result in text.

Before you commit a change that adds or modifies a UI element, take a screenshot
of each new or changed element with `bun run ui-screenshots` and show it to the
user, so that they can decide on it. For a new or changed animation, show its
video. Show only these screenshots. Do not show screenshots that only check that
a change, such as a refactor, keeps a screen the same. Check those yourself, and
report the result in text.

Show game screens in a 5-player game, so that the user sees a crowded table. If
the state that you need has fewer players, add a 5-player state to
`packages/testing/src/uiScreenshots.ts`.

When running in WSL, the host app cannot display screenshots or videos you send
it. Open each one that you show in its Windows app instead:
`explorer.exe "$(wslpath -w <file>)"`.

## Delivering changes

After making changes, complete the required checks, commit, and push
automatically to the "main" branch. Always rebase local commits onto upstream
changes instead of creating merge commits.

Use Conventional Commits for commit messages:
`type(optional-scope): description`, for example
`fix(client): clear stale spectators` or `docs: update setup instructions`.

When you tell the user about a commit, link it to GitHub. Do not give only its
hash in backticks. For example:
`[59abdc880 fix(server): send card identities before finishing a game](https://github.com/Hanabi-Live/hanabi-live/commit/59abdc880)`.

## Before pushing

Use `GITHUB_TOKEN` for GitHub CLI authentication:
`GH_TOKEN="$GITHUB_TOKEN" gh <command>`. If it is empty, source `~/.env` first:
`( set -a; source ~/.env; set +a; GH_TOKEN="$GITHUB_TOKEN" gh <command> )`. Do
not print or commit the token.

Use Bun for JavaScript dependency management; its version is pinned in the root
`package.json`. Use `bun install --frozen-lockfile`, `bun run <script>`, and
`bunx --bun --no-install <tool>`. Bun is also the JavaScript runtime. Commit
`bun.lock`, not an npm lockfile. `bun run test` runs four suites, each cached by
Turborepo and rerun only when its inputs change: `test-client` (Vitest),
`test-rust` (`cargo test`), `test-bun` (Bun's native test runner, including
integration tests against the compiled server), and `test-critical-css` (fails
when `public/css/critical.min.css` is out of date; regenerate it with
`bun run build-critical-css`). Run one with `bun run <suite>`; arguments to
`test-bun` go to the Bun test runner (such as `-t <pattern>`). The Rust and Bun
suites each start a disposable PostgreSQL server, which needs `initdb` and
`postgres` on `PATH` (or set `HANABI_TEST_DATABASE_URL` to one). Keep automatic
`.env` loading disabled in `bunfig.toml`; applications and build scripts manage
their own configuration.

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

This is the same entrypoint CI uses for TypeScript checks, Rust formatting,
Clippy, Rust dependency checks, Prettier, spelling, ShellCheck, and repository
consistency. CI runs the JavaScript and Rust checks in separate jobs; run the
no-argument command above before pushing. It requires Bun, JavaScript
dependencies, the pinned Rust toolchain, cargo-deny, cargo-machete, and
ShellCheck, but no running PostgreSQL service.

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
`server/engine` owns native game rules.

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

Live tables are in PostgreSQL, so `database-backup.sh` covers them. A binary
rollback cannot convert live state to another format.

**Never use `systemctl restart` or `systemctl stop` on a running game server.**
Use `/gracefulRestart` to restart, `/gracefulStop` to stop immediately while
preserving active games for recovery. Verify a successful process exit before
maintaining storage; a successful HTTP response only acknowledges the request.
`systemctl start` is only appropriate when the server is already stopped. An
HTTP success response does not prove a graceful restart has finished: verify the
new PID, running revision, restored tables, client assets, and logs.

## Database migrations

Use `./hanabi-live migrate status` to inspect migration state and
`./hanabi-live migrate apply` to apply pending migrations before restarting.
From a source checkout, run
`cargo run --manifest-path server/Cargo.toml -- migrate status` from the
repository root. The server embeds `install/migrations` and applies them with
SQLx, recording them in `_sqlx_migrations`, using the existing `.env` database
settings. Applying to an empty database installs `install/database_schema.sql`.
Migrations never run automatically during server startup.

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
creation require `-- no-transaction` as the file's first line and safe recovery
after partial failure.

Some tables (such as `chat_log`) are very large:

- Adding a nullable column or a constant default is safe while the server is
  online.
- `ALTER TABLE` blocks all reads and writes of the table until its transaction
  commits. Never run it before slow statements in the same migration; put it in
  its own migration or last.
- A migration file is sent as one query string, so it cannot commit partway: a
  `DO` block or procedure cannot `COMMIT`, and `VACUUM` cannot run. Every row it
  changes stays locked until it ends. To work in batches, split the work across
  migrations, which each commit.
- Do slow work only on rows the server does not write. Update rows that it
  writes (such as `users`, `seeds`, and the statistics tables) last, from values
  computed beforehand in temporary tables. Check what triggers do: deleting a
  game updates its players' `users` rows.
- Before writing a migration that changes many rows, count them with read-only
  queries against production, and plan lock duration and disk headroom.
  `migrate apply` cancels a migration when a live query waits too long for its
  locks (`MAX_BLOCKED_WAIT` in `server/src/migrations.rs`).
- To change a large column's type or format: add a new nullable column, deploy
  code that writes both, backfill it, deploy code that reads the new column,
  then drop the old one. Never rename or drop a column the running server still
  uses.
- Add `CHECK` constraints with `NOT VALID`, then `VALIDATE CONSTRAINT` without
  blocking normal reads and writes.
