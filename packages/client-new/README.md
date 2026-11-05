# New lobby

The opt-in lobby lives at **`/new`** on the Go, TypeScript, and Rust servers.
The classic lobby remains at `/lobby`; production does not switch automatically.

React owns the new lobby's DOM. Redux owns validated directory, chat, and
account state; one connection service owns its WebSocket and recovery. Shared
protocol schemas, game data, and chat symbols come from the existing packages.

The React lobby uses the classic lobby's layout, fonts, artwork, and shared
stylesheets from `public/css`. It does not load the classic JavaScript or
jQuery. Tailwind utilities remain available without a second CSS reset. Light
mode is the default; the appearance selector shares the classic client's
`darkMode` preference, including following the system theme. Lobby and pregame
chat have separate panes, and private-message drafts remain isolated.

The existing game/replay screen remains in use. A validated, single-use
session-storage request transfers navigation to it, then the new lobby closes
its connection. Replay creation happens **after** this handoff so disconnecting
cannot delete a newly created solo replay. Returning from the game opens `/new`.
The bridge does not queue or replay mutations after connection loss.

## Develop

From the repository root, `npm run build-client` builds both clients. Start a
development backend normally and open `/new`.

For live UI development, run `npm run dev --prefix packages/client-new` and open
`http://localhost:5173/new/`. Its proxy expects a local backend on port 8080.
Use the same `localhost` hostname throughout so the legacy game screen accepts
the development origin.

## Design prototypes

Open `http://localhost:5173/new/prototypes.html` in the Vite dev server to
compare ten interactive visual directions. This separate entry uses fictional
sample data, needs no backend or login, and never connects to live games. Built
releases include it at `/public/client-new/prototypes.html`; it does not replace
`/new`.

The studies use the Impeccable design playbooks at revision
`9fadc41729c38fd47d7ae622b501558653f9d2e9`, without its live-mode launcher or
hooks. The bundled prototype fonts retain their Open Font License files.

## Verify

Run `bash packages/client-new/lint.sh`. From this directory, `npm test` runs
state, connection, and rendering checks.

After building both clients, run `npx playwright test` here with
`HANABI_TEST_DATABASE_URL` pointing to a **disposable local PostgreSQL
service**. The fixture creates separate databases and processes, never reads the
ordinary `.env`, and exercises Go, TypeScript, and Rust. Go, Cargo, Redis 7.2+
binaries, and Playwright Chromium must be available. Use `--project=go` for a
targeted run.

Backend binaries are built once before the two isolated browser workers start.
Browser tests use unoptimized Rust application code with optimized dependencies
so password hashing stays fast; native release jobs still validate the release.
CI runs the browsers in the official Playwright container, matched to the
installed package version, while keeping backend processes on the host. Failure
screenshots and traces are retained.

Browser checks cover the game/replay handoff, reconnects, history, private chat,
table options, settings, mobile layout, and accessibility. CI runs these before
publishing either native release.
