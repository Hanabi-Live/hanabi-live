# Hanab Live Alpha UI Staging Design

This document proposes a way to let people test alpha UI builds (including per-PR builds) against the real production game server, then switch back to the normal site and continue the same game.

<br />

## Table of Contents

1. [Goals](#goals)
1. [Non-Goals](#non-goals)
1. [Current Constraints](#current-constraints)
1. [High-Level Architecture](#high-level-architecture)
1. [Why Not Use Cookies from GitHub Pages](#why-not-use-cookies-from-github-pages)
1. [Proposed Auth Flow](#proposed-auth-flow)
1. [Server Changes](#server-changes)
1. [Client Changes](#client-changes)
1. [Preview Build and Deployment](#preview-build-and-deployment)
1. [PR Discovery in the Client](#pr-discovery-in-the-client)
1. [Compatibility Gate for Preview Builds](#compatibility-gate-for-preview-builds)
1. [Data Model and Security](#data-model-and-security)

<br />

## Goals

- Allow people to open an alpha client build and play real games.
- Allow easy switching between alpha UI and production UI during the same game.
- Support per-PR preview builds.
- Keep blast radius low if an alpha build is broken.
- Preserve account identity, table membership, and game continuity.

<br />

## Non-Goals

- Creating a separate alpha game server/database.
- Allowing anonymous, unauthenticated cross-origin clients to drive the production server.

<br />

## Current Constraints

The existing architecture assumes same-origin client + server.

- Login uses `POST /login` and writes a secure session cookie.
  - Code: `packages/client/src/lobby/login.ts`, `packages/server/src/http/httpLogin.ts`
- WebSocket auth uses cookie-backed session state.
  - Code: `packages/server/src/http/httpWS.ts`
- Client hard-checks hostname against server-rendered domain in `#domain`.
  - Code: `packages/client/src/websocketInit.ts`
- Production cookie config uses `SameSite: "strict"` and `domain: env.DOMAIN`.
  - Code: `packages/server/src/http.ts`
- Login rejects mismatched client version.
  - Code: `packages/server/src/http/httpLogin.ts`

These are all correct for normal production safety, but they block a GitHub Pages preview model.

<br />

## High-Level Architecture

Use three pieces:

1. `prod UI` (normal site)
1. `alpha preview UI` (GitHub Pages, per PR)
1. `prod server` (single source of truth for games)

Key idea: do not rely on cross-site cookies for preview auth. Use short-lived signed alpha tokens instead.

<br />

## Why Not Use Cookies from GitHub Pages

GitHub Pages origin is cross-site relative to production (`*.github.io` vs `hanab.live`).

- `SameSite=strict` cookies are not sent on cross-site requests.
- Browser third-party cookie restrictions make cross-site cookie flows increasingly unreliable.
- Keeping production cookies first-party-only is good security posture.

Therefore, cookie auth should stay as-is for production UI, and alpha previews should use explicit bearer-style tokens.

<br />

## Proposed Auth Flow

### Entry Point

- User is logged into production site.
- User clicks `Open Alpha UI` (or `Open PR #XXXX UI`) from production UI.

### Session Handoff

1. Production UI calls new same-origin endpoint: `POST /alpha/handoff`.
1. Server verifies existing session cookie and returns a short-lived signed handoff token.
1. Production UI redirects to preview URL with token in URL fragment (not query), for example:
   - `https://hanabi-live.github.io/alpha/pr-3066/index.html#handoff=...`
1. Preview client reads fragment and calls production endpoint:
   - `POST /alpha/exchange` with handoff token.
1. Server returns short-lived alpha access token (and optional refresh token).
1. Preview connects WebSocket to production using token-based auth (query param or websocket subprotocol).

### Back to Production

- User opens normal production URL in another tab (or uses `Return to Production` button).
- Production site continues to use normal cookie session.
- Same account, same table, same game state on the same backend.

<br />

## Server Changes

### 1) Add alpha token endpoints

- `POST /alpha/handoff` (cookie-authenticated, same-origin)
- `POST /alpha/exchange` (validates handoff token, mints alpha access token)
- Optional: `POST /alpha/refresh` and `POST /alpha/revoke`

### 2) Add token-based WebSocket auth

Extend `/ws` auth path to accept either:

- existing cookie session (current behavior), or
- alpha access token (new behavior)

### 3) Add strict CORS allowlist for alpha endpoints

Only for the alpha endpoints (not globally):

- allow specific GitHub Pages origins for this repo

<br />

## Client Changes

### Production Client

- Add `Open Alpha UI` entry point.
- Request handoff token and redirect to preview.

### Preview Client

- Add support for:
  - `SERVER_ORIGIN` override
  - token exchange and token storage
  - token-authenticated WebSocket bootstrap
- Skip/replace strict `#domain` hostname check in preview mode.
  - Current check lives in `packages/client/src/websocketInit.ts`.

### Shared Behavior

- Keep all game logic/state handling unchanged once WebSocket is connected.

<br />

## Preview Build and Deployment

### Build Target

Add a dedicated preview build mode for client:

- compile-time flag (for example `ALPHA_PREVIEW=1`)
- injected `SERVER_ORIGIN=https://hanab.live`
- injected `PREVIEW_BUILD_ID` (PR number + commit SHA)

### GitHub Actions

Add workflow (for example `.github/workflows/alpha-preview.yml`) that:

1. Triggers on PR updates.
1. Builds preview client bundle.
1. Publishes to GitHub Pages path:
   - `/alpha/pr-<number>/`
1. Publishes preview metadata (for discovery UI), for example:
   - `/alpha/previews.json`
1. Posts/updates PR comment with preview URL.

### Lifecycle

- Keep only latest build per PR path by default.
- Optionally garbage-collect closed PR previews.

<br />

## PR Discovery in the Client

When a user selects `Open Alpha UI`, the production client should show a list of available preview builds instead of requiring a manual URL.

### Discovery Source

Use a generated metadata file on GitHub Pages, for example:

- `https://hanabi-live.github.io/alpha/previews.json`

Example shape:

```json
{
  "generatedAt": "2026-03-02T00:00:00Z",
  "previews": [
    {
      "prNumber": 3066,
      "title": "feat: responsive resize",
      "headSha": "abc123...",
      "updatedAt": "2026-03-02T00:00:00Z",
      "url": "https://hanabi-live.github.io/alpha/pr-3066/"
    }
  ]
}
```

### How the Production Client Uses It

1. User clicks `Open Alpha UI`.
1. Client fetches `previews.json`.
1. Client renders an in-app picker sorted by `updatedAt` (newest first), with PR number + title.
1. User picks a PR preview.
1. Client runs the handoff flow and redirects to the selected preview URL with handoff token in URL fragment.

### Why Use a Static Metadata File

- No GitHub API auth/token needed in browser.
- No GitHub rate-limit issues for end users.
- Fast and cacheable.
- Deterministic list of only successfully deployed previews.

<br />

## Compatibility Gate for Preview Builds

Not every PR should publish an alpha preview. If a PR changes server behavior or shared protocol in a way the production server does not support yet, a preview bundle could be misleading or broken.

### Rule

Only publish GitHub Pages preview for PRs that modify client-only paths.

### Suggested Allowlist

- `packages/client/**`
- `public/**` (only client static assets)
- docs/workflow metadata files if needed for preview plumbing

If a PR touches server or shared protocol paths, do not publish preview:

- `packages/server/**`
- `packages/data/**`
- `packages/game/**` (unless explicitly proven client-safe for production server compatibility)

### Workflow Behavior

In `.github/workflows/alpha-preview.yml`:

1. Detect changed files for the PR.
1. If files are outside the allowlist:
   - skip preview deployment
   - post/update PR comment that preview was intentionally skipped due to server/shared changes
1. If files are allowlisted:
   - proceed with preview build/deploy
   - include/update entry in `previews.json`

This keeps preview deployments aligned with real production server compatibility.

<br />

## Data Model and Security

### Token Properties

- Signed, short TTL:
  - handoff token: 15 minutes
  - access token: 8 hours
- Include:
  - user ID
  - issued-at / expiry
  - audience (`alpha-preview`)
  - optional PR/build metadata
  - nonce/jti for replay protection
