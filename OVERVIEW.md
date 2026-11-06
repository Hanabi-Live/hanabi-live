# Hanab Live Architecture Overview

This document provides an overview of the Hanab Live codebase, its architectural
choices, and instructions for development.

## Architecture

Hanab Live follows a monorepo structure with a Rust backend and TypeScript
clients.

### Backend

- **Language:** [Rust](https://www.rust-lang.org/)
- **Web Framework:** [Axum](https://github.com/tokio-rs/axum), including
  WebSockets.
- **Database:** [PostgreSQL](https://www.postgresql.org/) for persistent data
  (users, games, history).
- **Live State:** [Redis](https://redis.io/) with AOF persistence holds
  authoritative recoverable game state; it is not a disposable cache.
- **Location:** `server/`. Historical compatibility fixtures are retained in
  `server/testdata/`; there is no Go application server.

### Frontend

- **Language:** [TypeScript](https://www.typescriptlang.org/)
- **UI Library:** [jQuery](https://jquery.com/) for DOM manipulation and UI
  components.
- **State Management:** [Redux](https://redux.js.org/) with
  [Immer](https://immerjs.github.io/immer/) for immutable state updates.
- **Game Rendering:** [Konva](https://konvajs.org/) (a 2D canvas library) for
  the interactive game board.
- **Bundling:** [esbuild](https://esbuild.github.io/) for TypeScript bundling
  and [Grunt](https://gruntjs.com/) for CSS concatenation/minification.
- **Location:** `packages/client/`.

The React lobby lives in `packages/client-new/`, uses Redux Toolkit and Vite,
and is served at `/new`. It hands off gameplay to the shared Konva game screen.

### Shared Logic

- Core game rules and data structures are located in `packages/game/` and
  `packages/data/`. These are shared across the TypeScript client and the
  Node.js packages. Rust's native game rules live in `server/engine`, checked
  against shared variant and replay corpora. Native process tests and disposable
  service fixtures live in `packages/testing/`.

---

## Development Workflow

### Prerequisites

- Rust (pinned in `rust-toolchain.toml`); Go only for building Tern
- Bun (for the frontend and build tools)
- PostgreSQL
- Redis

### Running the Development Server

Follow the [installation instructions](docs/install.md) and
[server runbook](server/README.md). To run Rust and the classic-client watcher:

```bash
./dev.sh
```

This script performs two main actions:

1. **Starts the Rust Server:** Executes `./run.sh`, which builds the native
   binary and starts the server.
2. **Starts Frontend Watch:** Executes `./packages/client/esbuild_dev.sh`, which
   watches the TypeScript files in `packages/client/src/` and automatically
   rebuilds the bundle in `public/js/bundles/main.min.js` whenever a change is
   detected.

The server will be available at `http://localhost:1212` (or the port specified
in your `.env` file).

---

## FAQ

### Can I run a frontend dev server that connects to the live backend?

The classic client is served by Rust. The React lobby has a Vite development
server (`bun run dev` in `packages/client-new`) that proxies to a local Rust
backend on port 8080.

However, if you want to test local frontend changes against the live production
data, you should be aware of several hurdles:

1. **Domain Validation:** The client code (in `websocketInit.ts`) checks that
   the current hostname matches the domain rendered by the server. It will throw
   an error if they don't match.
2. **Authentication:** The application uses cookie-based authentication. If you
   try to run the frontend on `localhost` and connect to `hanab.live`, your
   browser will not send the `hanab.live` cookies due to security restrictions
   (CORS/SameSite).
3. **WebSocket URL:** The WebSocket connection URL is automatically derived from
   `globalThis.location.hostname`.

**Recommended approach for frontend development:** Run the full stack locally.
You can use a local copy of the production database if you need specific data,
but the frontend and backend should be run together as intended by the project
structure.
