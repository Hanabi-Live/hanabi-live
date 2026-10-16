# WebSocket reconnect and authoritative recovery

This document defines the narrow reconnect contract introduced for
[#2367](https://github.com/Hanabi-Live/hanabi-live/issues/2367). It deliberately
does **not** introduce a second authentication mechanism or an incremental
gameplay-state resume protocol.

## Connection modes

| Mode            | WebSocket URL     | Server response                                                             |
| --------------- | ----------------- | --------------------------------------------------------------------------- |
| Initial         | `/ws`             | `welcome`, followed by user/table lists, lobby chat and recent game history |
| Reconnect probe | `/ws?reconnect=1` | `welcome` only, with `connectionMode: "reconnect"`                          |

The optional `welcome.connectionMode` is `"initial"` for a normal connection.
Clients that predate this addition can ignore the new field. The query parameter
is **not trusted for identity**: both modes require the **same authenticated
session cookie**, and the WebSocket endpoint performs the same cookie, user and
IP checks.

The reconnect response includes the server's current `playingAtTables`,
`disconSpectatingTable` and `disconShadowingSeat`. These are hints about
authenticated server-side membership, **not** permission to reuse the old client
game state.

## Browser recovery

1. If an established WebSocket closes unexpectedly, the client enters recovery.
   Do not reconnect deliberately closed sessions after a server `error`.
2. Retry with bounded exponential backoff while the page is foregrounded and the
   browser reports network availability. Wake on `online` and visibility
   changes, since mobile browsers can pause timers in background.
3. Before each retry, probe `/test-cookie`. If authentication expired, reload
   the page and return to normal sign-in. No new session token is introduced.
4. Open `/ws?reconnect=1` **only to verify the cookie and server connection**.
   During recovery, do not send gameplay commands and do not apply incoming
   lobby/game deltas to the previous UI. A probe that does not receive `welcome`
   within 15 seconds is closed and retried.
5. Upon `welcome` (whether or not an older server supplies `connectionMode`),
   reload the document. The new page makes an **initial** connection and
   reconstructs state from an authoritative server snapshot.
6. The existing `welcome` return-to-table and spectator flow then restores the
   appropriate table and requests gameplay state through `getGameInfo1` and
   `getGameInfo2`. The client does **not** replay missed game actions as if they
   were locally authoritative.

A document reload rather than in-place gameplay state merging is intentional:
game actions, player hands, notes and authoritative turn state must not be
resumed by applying deltas to a potentially stale `HanabiUI`.

## Data and limits

- **User/table lists:** fetched afresh on the initial connection after reload;
  do not merge old lists with new snapshots.
- **Lobby chat:** rebuilt from the latest persisted page, with `chatID` for
  deduplication. Older lobby messages are not paginated, and live messages
  missed in transit are _not_ individually replayed.
- **Table chat:** rebuilt from the table's current in-memory history. No new
  message IDs or read cursors are introduced by this change.
- **PMs:** only existing PM history and live semantics apply; no new PM backfill
  is guaranteed here.
- **Gameplay:** never resume from a locally cached action stream. The server's
  existing authenticated rejoin/game-info commands remain authoritative.
- **Disconnected spectators:** reconnect only to membership still known by the
  server; disappearing tables must not be reconstructed locally.
- **Pre-game tables:** the existing server may remove disconnected players from
  unstarted tables. This change does not alter that policy.

This intentionally does not implement seamless, in-page resume, transferable
resume tokens, guaranteed delivery of ephemeral events during a disconnect, or
storage of table chat in PostgreSQL. Those are separate changes with additional
gameplay and protocol tests.

## Compatibility and rollout

A new client can contact an older server: it will receive the normal `welcome`
and extra bootstrap messages, ignore the latter, and reload. An old client
contacting the new server uses `/ws` and sees unchanged initial behavior plus an
optional welcome field.

A future in-place resume protocol must explicitly specify snapshot versioning
and exactly which client caches to invalidate; it must not silently reuse this
`reconnect=1` confirmation as such a guarantee.
