# Hanab Live Architecture Overview

This document provides an overview of the Hanab Live codebase, its architectural choices, and instructions for development.

## Architecture

Hanab Live follows a monorepo structure with a Go backend and a TypeScript/jQuery frontend.

### Backend

- **Language:** [Go](https://go.dev/)
- **Web Framework:** [Gin](https://gin-gonic.com/)
- **Real-time Communication:** WebSockets via the [Melody](https://github.com/olahol/melody) framework.
- **Database:** [PostgreSQL](https://www.postgresql.org/) for persistent data (users, games, history).
- **Caching/State:** [Redis](https://redis.io/) is used for transient data like banned IPs.
- **Location:** The primary backend code is in the `server/` directory.

> **Note:** There is a newer, potentially experimental or transitional backend implementation in `packages/server` using Node.js, Fastify, and Drizzle ORM, but the primary production server is currently the Go implementation.

### Frontend

- **Language:** [TypeScript](https://www.typescriptlang.org/)
- **UI Library:** [jQuery](https://jquery.com/) for DOM manipulation and UI components.
- **State Management:** [Redux](https://redux.js.org/) with [Immer](https://immerjs.github.io/immer/) for immutable state updates.
- **Game Rendering:** [Konva](https://konvajs.org/) (a 2D canvas library) for the interactive game board.
- **Bundling:** [esbuild](https://esbuild.github.io/) for TypeScript bundling and [Grunt](https://gruntjs.com/) for CSS concatenation/minification.
- **Location:** `packages/client/`.

### Shared Logic

- Core game rules and data structures are located in `packages/game/` and `packages/data/`. These are shared across the TypeScript client and the Node.js packages. (The Go server maintains its own implementation of the game rules in Go.)

---

## Development Workflow

### Prerequisites

- Go (for the backend)
- Node.js & npm (for the frontend and build tools)
- PostgreSQL
- Redis

### Running the Development Server

To start both the backend and the frontend watch process, run the following script from the root of the repository:

```bash
./dev.sh
```

This script performs two main actions:
1. **Starts the Go Server:** Executes `./run.sh`, which builds the Go binary and starts the server.
2. **Starts Frontend Watch:** Executes `./packages/client/esbuild_dev.sh`, which watches the TypeScript files in `packages/client/src/` and automatically rebuilds the bundle in `public/js/bundles/main.min.js` whenever a change is detected.

The server will be available at `http://localhost:1212` (or the port specified in your `.env` file).

---

## FAQ

### Can I run a frontend dev server that connects to the live backend?

**Strictly speaking, no.** The frontend is not designed to be run in a standalone "dev server" (like Vite or Webpack Dev Server). It is served as static files by the Go backend.

However, if you want to test local frontend changes against the live production data, you should be aware of several hurdles:
1. **Domain Validation:** The client code (in `websocketInit.ts`) checks that the current hostname matches the domain rendered by the server. It will throw an error if they don't match.
2. **Authentication:** The application uses cookie-based authentication. If you try to run the frontend on `localhost` and connect to `hanab.live`, your browser will not send the `hanab.live` cookies due to security restrictions (CORS/SameSite).
3. **WebSocket URL:** The WebSocket connection URL is automatically derived from `globalThis.location.hostname`.

**Recommended approach for frontend development:**
Run the full stack locally. You can use a local copy of the production database if you need specific data, but the frontend and backend should be run together as intended by the project structure.
