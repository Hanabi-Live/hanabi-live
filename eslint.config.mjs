// This is the configuration file for ESLint, the TypeScript linter:
// https://eslint.org/docs/latest/use/configure/

// @ts-check

import { completeConfigBase } from "eslint-config-complete";
import { defineConfig } from "eslint/config";

export const hanabiConfigBase = defineConfig(
  ...completeConfigBase,

  {
    rules: {
      // Properties follow a meaningful order, such as `x, y, w, h` for geometry, not alphabetical
      // order.
      "complete/sort-objects": "off",

      // The rule checks types deeply, so it rejects branded numbers, Zod-inferred types, and the
      // Window and Konva declarations, which must be mutable.
      "complete/type-declaration-immutability": "off",

      // Enforce the "normal" function style throughout the entire project.
      "func-style": ["error", "declaration"],

      // The "v" flag needs Safari 17, but Vite's default build target still includes Safari 16.4.
      // iOS 17 dropped the iPhone 8, iPhone X, and first iPad Pro, so they stay on Safari 16.
      "regexp/require-unicode-sets-regexp": "off",

      // Modules keep their state in top-level variables that functions set. Most of this state
      // exists once per page: the WebSocket connection and its timers, the open modal, the chat
      // input, and the React roots. A class would not make it safer, because the page would still
      // have one instance. Keep the state of a game in the store, or reset it in `closeGame`, so
      // that it does not carry into the next game.
      "unicorn/no-top-level-assignment-in-function": "off",

      // This flags loops over common expressions, such as `eRange(n + 1)` and
      // `CHAT_EMOTES[category]`, which a temporary variable would not make clearer.
      "unicorn/no-unreadable-for-of-expression": "off",

      // This flags common one-line idioms, such as `new Set(items).size`, which a temporary
      // variable would not make clearer.
      "unicorn/no-unreadable-new-expression": "off",

      // Event handlers, timers, and other functions that do not wait start async work with
      // `.then()` and `.catch()`. With `await`, each one would need an async wrapper that nothing
      // waits for.
      "unicorn/prefer-await": "off",

      // `Iterator.prototype.toArray` needs Safari 18.4, but Vite's default build target still
      // includes Safari 16.4.
      "unicorn/prefer-iterator-to-array": "off",

      // The `Set` methods, such as `union`, need Safari 17, but Vite's default build target still
      // includes Safari 16.4.
      "unicorn/prefer-set-methods": "off",

      // Preserve compatibility with browsers without the newest encoding APIs.
      "unicorn/prefer-uint8array-base64": "off",

      // Keep explicit branches in the game rules and event handlers.
      "unicorn/try-complexity": "off",
    },
  },

  // The wire contracts generated from "server/protocol" keep the line breaks of their Rust doc
  // comments and the generator's object layout, and their enums have the values that the wire
  // sends.
  {
    files: ["**/src/generated/**"],
    rules: {
      "complete/consistent-enum-values": "off",
      "complete/consistent-object-braces": "off",
      "complete/format-jsdoc-comments": "off",

      // Names follow the Rust types, such as "CreateTableSettings".
      "unicorn/no-non-function-verb-prefix": "off",
    },
  },

  {
    ignores: [
      "packages/data/src/version.js",
      "packages/game/docs/assets/main.js",
    ],
  },
);

export default defineConfig(...hanabiConfigBase);
