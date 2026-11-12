# Wire contracts

This crate owns every JSON payload exchanged between the server and its clients
(WebSocket messages and HTTP API bodies) and the format of the game catalog in
`packages/game/src/json`. It does not own database records, actors, or game
state, and has no dependencies on those implementations. The WebSocket frames
around these payloads are described in `packages/data/src/functions/frames.ts`.
Authorization, normalization, HTML escaping, and business rules remain in the
server.

Clients use only the generated schemas and the types inferred from them. Do not
write TypeScript interfaces for these payloads.

## Changing a contract

1. Update the Rust DTO and its schema annotations in the module of its area
   (such as `src/game.rs`). Register new message names in `src/registry.rs`.
1. If the contract relies on a default, null handling, union, bound, or
   rejection rule that `fixtures/compatibility.json` does not cover yet, add a
   case for it. Rust and Bun both run these cases.
1. From the repository root, run:

   ```sh
   bash scripts/dev/generate-protocol.sh
   ```

1. Commit the generated `packages/data/src/generated/protocol.ts` and
   `packages/game/src/generated/protocol.ts` with the source changes.

Ordinary client builds use the committed output and do not need Rust. Generation
builds only this small crate and formats its output. Full lint and CI's Rust
lint job run `generate-protocol.sh --check`. The crate shares the server's Cargo
workspace, lockfile, and dependency cache, so generation and runtime use the
same schema-library versions. Neither generation nor these contract tests needs
PostgreSQL.

Schemars derives the schema from the DTOs. Native decoding validates that schema
before serde applies defaults. The generator translates the supported schema
subset to Zod, with `CLIENT_COMMAND_SCHEMAS`, `CLIENT_REPLY_SCHEMAS`, and
`SERVER_COMMAND_SCHEMAS` registries and their inferred `ClientCommandData`,
`ClientReplyData`, and `ServerCommandData` types. Unknown schema features fail
generation rather than silently losing validation.

## Compatibility rules

- Objects reject unknown fields. Optional fields are omitted, not serialized as
  `null`; explicit null is always rejected.
- Missing fields with defaults are normalized identically. Empty strings are not
  automatically replaced, trimmed, or escaped.
- Integer bounds remain JavaScript-safe. An integer type with `brand` in
  `src/integers.rs` has a branded TypeScript type.
- Timestamps are RFC 3339 strings in UTC with milliseconds. The generated
  schemas check this form and keep the value a string.
- Generated objects and arrays are readonly.
- Rust rejects floating-point JSON tokens for integer fields. JavaScript cannot
  distinguish `1` from `1.0` after JSON parsing. The fixtures record this
  difference.

Rust process and browser tests also exercise the generated client validators
against actual server traffic.

## Game catalog

The `Catalog*` DTOs describe the catalog files. A flag is either `true` or
omitted. The engine and the game library each derive their variant model from
these entries. When you add a catalog property, update both derivations: the
engine's `catalog.rs` and the game library's `variantsInit.ts` or
`suitsInit.ts`. `bun run test` compares every variant that the two derive.

## Stored state

Keep internal state separate from wire DTOs. Table chat and pregame statistics
are stored as JSON in table checkpoints; do not change durable storage formats
merely to type those values.
