# Changelog

This page lists the changes to Hanab Live, excluding bug fixes.

## November 8th, 2026

- Breaking changes:
  - Removed the card cycling option (used in about 0.03% of games) and the games
    that used it.
  - Removed the legacy starting player option and the pre-April 2020 games that
    did not start with the first seat.
  - Public pages and API endpoints now reject unknown or invalid query
    parameters with an error that names the problem, instead of silently using
    defaults.
- Removed the following chat commands:
  - `/playerinfo`
  - `/vote` (tap the skull button instead, which also works on touch devices)
  - `/tagdelete` (use `/untag` instead)
  - `/linked` (use `/links` instead)
- Removed the full-history and full-seed API aliases.
- Removed the videos page.
- Added a confirmation when playing a card whose note says it is unplayable.
- The deck tooltip in a shared replay shows how long the replay has been
  running.
- The CSS bundle loads without blocking page rendering.
- Database migrations are now run with `hanabi-live migrate` (SQLx), and a
  migration is cancelled if it blocks live queries for too long.

## November 7th, 2026

- Added the following chat commands:
  - `/block`
  - `/unblock`
  - `/blocked`
- Players with a block between them cannot join or spectate each other's tables
  or send each other private messages.
- Added spoiler-free shared replay reviews, which only reveal what has already
  happened.
- Opening a link to a shared replay now joins the existing shared replay of that
  game instead of creating a separate copy.
- Added a warning before an idle game ends.
- Players at a full table are now told when someone else tries to join.
- Cards with a "spook" note now show a ghost.
- In speedrun mode, clicking to give a clue with no clue tokens now buzzes.
- Each browser tab now keeps its own signed-in account, so reloading one tab no
  longer switches it to the account most recently used in another tab.
- Average scores and strikeout rates are no longer calculated or shown, so that
  the site feels less competitive.
- Chat messages older than one year are deleted daily.
- Security:
  - Login attempts are rate limited per address and per account.
  - Password hashing is limited per address.
  - Credential checks and rejected connections are logged.
- Graceful restarts and stops are explained to players, and the startup
  announcement reports how long the server was down.
- Server and HTTP errors are posted to Discord instead of Sentry.
- The classic client validates every message from the server.
- Many database queries and server code paths were optimized.
- Installation and development:
  - Added a production setup script.
  - PostgreSQL and Redis memory are sized from the server's RAM.
  - Failed database backups are reported to Discord.
  - Local development runs with one command, using Podman or Docker for
    PostgreSQL and Redis.
  - The client is bundled with Vite and tested with Vitest.

## November 6th, 2026

- The server was rewritten in Rust, replacing the Go server. Live game state is
  now stored durably in Redis, so games survive restarts.
- Added a game-preserving graceful stop for maintenance, which is announced on
  Discord.
- Errors shown to players now include an actionable cause and a diagnostic ID.
- Table names are now based on the table owner instead of being randomly
  generated.
- Removed friends history.
- Personal history now loads only when its screen is opened.
- Removed support for legacy SHA-256 password hashes.
- Installation and development:
  - Added anonymous release downloads and `deploy.sh`, which deploys a release
    that has passed CI.
  - `bash lint.sh` runs every check, with Turborepo caching.

## November 5th, 2026

- Disconnected players are removed from a pregame table after a short grace
  period, and abandoned pregame tables are closed.
- Simplified the global statistics page.
- JavaScript tooling moved to Bun.

## November 3rd, 2026

- Database backups no longer risk filling the disk.

## November 1st, 2026

- Added advanced filters to the shared missing scores page.

## October 20th, 2026

- Added the missing Double Dark variants, such as "Black & Dark Orange".

## October 16th, 2026

- Deleting a lobby message in Discord now also deletes it on the site.
- Added the following note shorthands for unclued finesses (call to play):
  - `[xf]`
  - `[ctp]`

## October 7th, 2026

- Added the `/pmhistory` chat command, which shows recent private messages.
- Improved card dragging.

## October 2nd, 2026

- Added dark mode, with a System / Light / Dark setting.

## September 28th, 2026

- Improved tooltips.

## September 27th, 2026

- Added a read-only tag search API:
  - `/api/v1/tags/[username]`
  - `/api/v1/tag/[tag]`

## September 18th, 2026

- Replay JSON now includes the seed.
