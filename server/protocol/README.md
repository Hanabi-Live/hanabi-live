# Wire contracts

This crate owns the migrated JSON payloads, not database records, actors, or
game state. It has no dependencies on those implementations. WebSocket framing
remains `command JSON`; authorization, normalization, HTML escaping, and
business rules remain in the server.

The pilot covers chat and private history, relationship requests, table
join/leave/leadership/variant selection, start/restart/spectating, gameplay
table commands, and chat/table lifecycle notifications. Existing public
TypeScript interfaces remain available through `@hanabi-live/data`.

## Changing a contract

1. Update the Rust DTO and its schema annotations in `src/lib.rs`. Register new
   message names in `src/registry.rs`.
1. If the contract relies on a default, null handling, union, bound, or
   rejection rule that `fixtures/compatibility.json` does not cover yet, add a
   case for it. Rust and Bun both run these cases.
1. From the repository root, run:

   ```sh
   bash scripts/dev/generate-protocol.sh
   ```

1. Commit `packages/data/src/generated/protocol.ts` with the source changes.

Ordinary client builds use the committed output and do not need Rust. Generation
builds only this small crate and formats one file. Full lint and CI's second
lint shard run `generate-protocol.sh --check`. The crate shares the server's
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
- Integer bounds remain JavaScript-safe. Table IDs retain their TypeScript
  brand.
- Timestamp strings keep their existing representation; generated schemas do not
  parse or reformat them. Readonly Zod objects/arrays retain their existing
  behavior.
- Rust retains its rejection of floating-point JSON tokens for integer fields.
  JavaScript cannot distinguish `1` from `1.0` after JSON parsing. Fixtures
  record that pre-existing difference rather than silently changing either
  parser.

The fixtures were checked against both handwritten parsers before adoption and
are now consumed by Rust and Bun tests. Rust process and browser tests also
exercise the generated client validators against actual server traffic.

## Stored state

Keep internal state separate from wire DTOs. Table chat and pregame statistics
are stored as JSON in table checkpoints; do not change durable storage formats
merely to type those values.
