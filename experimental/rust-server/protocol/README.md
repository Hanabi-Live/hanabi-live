# Wire contracts

This crate owns the migrated JSON payloads, not database records, actors, or
game state. It has no dependencies on those implementations. WebSocket framing
remains `command JSON`; authorization, normalization, HTML escaping, and
business rules remain in the server.

The pilot covers chat and private history, relationship requests, table
join/leave/leadership/variant selection, start/restart/spectating, table receipt
commands, and chat/table lifecycle notifications. Existing public TypeScript
interfaces remain available through `@hanabi-live/data`.

## Changing a contract

1. Update the Rust DTO and its schema annotations in `src/lib.rs`. Register new
   message names in `src/registry.rs`.
1. Add compatibility fixtures in `fixtures/compatibility.json`, including
   normalization/defaults and rejection cases.
1. From the repository root, run:

   ```sh
   bash scripts/bash/generate_protocol.sh
   ```

1. Commit `packages/data/src/generated/protocol.ts` with the source changes.

Ordinary client builds use the committed output and do not need Rust. Generation
builds only this small crate and formats one file. Full lint and CI's second
lint shard run `generate_protocol.sh --check`. The crate shares the server's
Cargo workspace, lockfile, and dependency cache, so generation and runtime use
the same schema-library versions. Neither generation nor these contract tests
needs PostgreSQL or Redis.

Schemars derives the schema from the DTOs. Native decoding validates that schema
before serde applies defaults. The generator translates the supported schema
subset to Zod, with inferred `ClientWireData` and `ServerWireData` types.
Unknown schema features fail generation rather than silently losing validation.

## Compatibility rules

- Objects reject unknown fields. Optional fields are omitted, not serialized as
  `null`; explicit null is rejected unless the contract explicitly permits it.
- Missing fields with defaults are normalized identically. Empty strings are not
  automatically replaced, trimmed, or escaped.
- Integer bounds remain JavaScript-safe. Request IDs remain limited to 128 UTF-8
  bytes, not merely 128 characters. Table IDs retain their TypeScript brand.
- Timestamp strings keep their existing representation; generated schemas do not
  parse or reformat them. Readonly Zod objects/arrays retain their existing
  behavior.
- Classic private messages may include a string `room` in the native
  compatibility DTO. Delivery remains recipient-only; the canonical TypeScript
  request still rejects that extra field.
- Rust retains its rejection of floating-point JSON tokens for integer fields.
  JavaScript cannot distinguish `1` from `1.0` after JSON parsing. Fixtures
  record that pre-existing difference rather than silently changing either
  parser.

The fixtures were checked against both handwritten parsers before adoption and
are now consumed by Rust and Jest. Real Go/Rust process and browser tests also
exercise the generated client validators against actual server traffic.

## Incremental boundary

Creation/update options, full table/pregame snapshots, gameplay/replay events,
account settings, and historical-game schemas remain on their existing paths.
Migrate them one family at a time, keeping internal state separate from wire
DTOs. Some existing history/snapshot adapters still carry JSON values; do not
change durable storage formats merely to replace those adapters.
