# WebSocket reconnect and authoritative recovery

## Fast recovery

Current clients connect using `/ws?version=<client-version>` both initially and
after a disconnect. Both cases require the same session cookie, account, and IP
checks. Supplied client versions are validated, including explicit empty values.
Older authenticated clients that omit `version` remain supported so their open
tabs can reconnect across the rollout. Login version validation is unchanged.

Authentication and table membership precede optional lobby reads. `welcome`
contains `totalGames: null` while statistics are unknown. The Rust-owned
`lobbyStatus` contract reports `loading`, `ready` with the real total, or
`error` with a diagnostic message when available. `lobbyLoad {}` retries failed
optional loading without reconnecting the game. Lobby loading is asynchronous
for every connection. The legacy `reconnect=1` welcome-only probe remains
supported for old clients, but current clients request fresh user/table
directories.

Personal history pages are requested only when the history screen is opened
(including direct history links), never during login, reconnect, or `lobbyLoad`.
Account totals and lobby chat still load independently.

History and statistics use a separate two-connection read-only pool, with a
two-second statement/acquisition limit. The primary pool has eight connections
and the archive pool two: the total connection budget has not increased.
Deferred initialization has a bounded queue and at most one load per session;
failures remain visible rather than appearing as empty successful results.
Optional reads are canceled when maintenance begins, without canceling admitted
gameplay persistence.

Discord initializes after the game listeners are ready. Its optional lifecycle
announcements have a five-second budget; a slow integration is logged rather
than holding game recovery behind external HTTP requests.

## Planned restarts

After durable draining, Rust sends `restart {}` and closes sockets with
code 1012. This is not a fatal application `error`. Clients retry immediately,
then use bounded exponential backoff with jitter. Authentication failures still
return the user to sign-in; offline/background tabs resume when connectivity and
visibility return.

For the same authenticated player in the same live game, the classic client
retains its canvas and replaces the entire action history through the existing
authenticated rejoin and `getGameInfo2` flow. It does not merge missed deltas
into cached gameplay state or replay unacknowledged commands. Gameplay sends
remain disabled until the authoritative history is applied. Changed accounts and
live-to-replay transitions rebuild the game UI instead.

User/table directories are replaced on reconnect. Existing PM/history retention
rules still apply; this does not promise delivery of ephemeral messages missed
during disconnection. Spectator shadows retain their restricted viewpoint.

## Browser regression

The lobby milestone test exercises an actual process replacement with two
authenticated game clients and checks that both recover without replacing their
canvases. CI does not enforce production-sized archive latency: the former
two-million-game benchmark and separate release build exceeded the five-minute
browser job budget. Production-sized recovery still requires deployment
validation.
