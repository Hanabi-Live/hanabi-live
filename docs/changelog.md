# Changelog

Changes since September 8, 2026, excluding bug fixes.

## Gameplay and interface

- Added dark mode, with a System / Light / Dark setting.
- Added a warning before an idle game ends.
- Added a confirmation when playing a card whose note says it is unplayable.
- Cards with a "spook" note now show a ghost.
- Added the `[xf]` and `[ctp]` note shorthands for unclued finesses (call to
  play).
- In speedrun mode, clicking to give a clue with no clue tokens now buzzes.
- Voting to terminate a game is now done by tapping the skull button, which also
  works on touch devices. The `/vote` command was removed.
- Players at a full table are now told when someone else tries to join.
- Table names are now based on the table owner instead of being randomly
  generated.
- Disconnected players are removed from a pregame table after a short grace
  period, and abandoned pregame tables are closed.
- Each browser tab now keeps its own signed-in account, so reloading one tab no
  longer switches it to the account most recently used in another tab.
- Improved tooltips and card dragging.
- Added the missing Double Dark variants, such as "Black & Dark Orange".

## Replays

- Added spoiler-free shared replay reviews, which only reveal what has already
  happened.
- Opening a link to a shared replay now joins the existing shared replay of that
  game instead of creating a separate copy.
- The deck tooltip in a shared replay shows how long the replay has been
  running.
- Replay JSON now includes the seed.

## Chat and social

- Added private message history with `/pmhistory`.
- Added `/block`, `/unblock`, and `/blocked`. Players with a block between them
  cannot join or spectate each other's tables or send each other private
  messages.
- Lobby chat messages have stable IDs, and deleting a lobby message in Discord
  also deletes it on the site.
- Chat messages older than one year are deleted daily.

## Website and API

- Added a read-only tag search API: `/api/v1/tags/[username]` and
  `/api/v1/tag/[tag]`.
- Added advanced filters to the shared missing scores page.
- Simplified the global statistics page.
- Public pages and API endpoints now reject unknown or invalid query parameters
  with an error that names the problem, instead of silently using defaults.
- Personal history now loads only when its screen is opened.

## Removed

- Average scores and strikeout rates are no longer calculated or shown, so that
  the site feels less competitive.
- Removed the card cycling option (used in about 0.03% of games) and the games
  that used it.
- Removed the legacy starting player option and the pre-April 2020 games that
  did not start with the first seat.
- Removed friends history.
- Removed the videos page.
- Removed the `/playerinfo` command and several redundant chat command aliases,
  such as `/tagdelete` (use `/untag`) and `/linked` (use `/links`).
- Removed the full-history and full-seed API aliases.
- Removed support for legacy SHA-256 password hashes.

## Security

- Login attempts are rate limited per address and per account.
- Password hashing is limited per address.
- Credential checks and rejected connections are logged.

## Server

- The server was rewritten in Rust, replacing the Go server. Live game state is
  now stored durably in Redis, so games survive restarts.
- Added a game-preserving graceful stop for maintenance. Graceful restarts and
  stops are explained to players and announced on Discord, and the startup
  announcement reports how long the server was down.
- Server and HTTP errors are posted to Discord instead of Sentry.
- Errors shown to players now include an actionable cause and a diagnostic ID.
- Every message between the server and its clients is defined in one typed
  contract in `server/protocol`, and the classic client validates every server
  message.
- Database migrations are now run with `hanabi-live migrate` (SQLx), and a
  migration is cancelled if it blocks live queries for too long.
- Many database queries and server code paths were optimized.

## Installation and development

- Added a production setup script, anonymous release downloads, and `deploy.sh`,
  which deploys a release that has passed CI.
- PostgreSQL and Redis memory are sized from the server's RAM.
- Database backups no longer risk filling the disk, and failed backups are
  reported to Discord.
- JavaScript tooling moved to Bun. The client is bundled with Vite and tested
  with Vitest.
- Local development runs with one command, using Podman or Docker for PostgreSQL
  and Redis.
- `bash lint.sh` runs every check, with Turborepo caching.
- The CSS bundle loads without blocking page rendering.
