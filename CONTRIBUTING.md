# Contributing to the Hanab Live Project

With issues:

- Use the search tool before opening a new issue.

With pull requests:

- We hang out in [the Discord server](https://discord.gg/FADvkJp) in the
  `#website-development` channel. Come say hi.
- Your pull requests need to pass the linter. To set up the linter, read and
  follow the [installation instructions](docs/install.md).
- Help me fix all these bugs and issues!

## Server Code

The [native Rust server](server/README.md) runs in production. Preserve shared
rules, client protocol behavior, and replay compatibility. Process tests and
disposable database/Redis fixtures live in `packages/testing`. See the
[server evaluation](docs/server-evaluation.md).

Before submitting server changes, run:

```sh
cargo test --locked --manifest-path server/Cargo.toml
cargo test --locked --manifest-path server/engine/Cargo.toml
bash lint.sh
```

Database integration tests require `HANABI_TEST_DATABASE_URL` pointing to a
disposable local PostgreSQL instance. Native and process/browser tests start
private Redis instances using `redis-server` and `redis-cli` on `PATH`. Never
point integration tests at production. Follow the server runbook for SQLx
metadata regeneration after query or schema changes.

## Creating a New Variant

- First, create a GitHub issue to discuss how the variant should work and if it
  should be implemented at all.
- Next, create the variant on your local computer by following the below steps.
- If your variant adds new suits into the game, modify "suits.json" and add them
  at the end.
- You do not have to manually change "variants.json" or "variants.txt", as those
  files are automatically created by the "create-variants-json" script.
- Instead, find the file "getVariantDescriptions.ts" and look for the
  "variantDescriptions" variable. This contains the functions that create each
  variant. You need to create a new function and add it to this list. (You can
  use an existing function as a template.)
- Note that the clue color palate will add clue colors from left to right for
  the variant in the order that the suits are listed for that variant.
- Once your modifications are complete, run `bun run create-variants-json` to
  create a new version of "variants.json" and "variants.txt". (The
  "variants.json" file is used by the server as the list of allowed variant
  combinations.)
- Run a test game to make sure everything in the new variants work as intended.
- Run "./lint.sh" to make sure that your changes pass the linter.
- Submit a pull request.
