// This is the configuration file for ESLint, the TypeScript linter:
// https://eslint.org/docs/latest/use/configure/

// @ts-check

import { completeConfigBase } from "eslint-config-complete";
import { defineConfig } from "eslint/config";

export const hanabiConfigBase = defineConfig(
  ...completeConfigBase,

  {
    rules: {
      // Insert changed or disabled rules here, if necessary.
      // @template-customization-start

      // Let Prettier format object literals.
      "complete/consistent-object-braces": "off",

      // Keep domain-specific property ordering.
      "complete/sort-destructured-properties": "off",
      "complete/sort-objects": "off",

      // The rule checks types deeply, so it rejects branded numbers, Zod-inferred types, and the
      // Window and Konva declarations, which must be mutable.
      "complete/type-declaration-immutability": "off",

      /**
       * Documentation:
       * https://eslint.org/docs/latest/rules/func-style
       *
       * Enforce the "normal" function style throughout the entire project.
       */
      "func-style": ["error", "declaration"],

      // Unicode code point escapes are enforced by Unicorn, including values below 256.
      "regexp/hexadecimal-escape": "off",

      // The client uses positional captures in URL, chat, and note parsers.
      "regexp/prefer-named-capture-group": "off",

      // Preserve compatibility with browsers without the newest regular expression flag ("v").
      "regexp/require-unicode-sets-regexp": "off",

      // Class members follow the existing UI style.
      "unicorn/consistent-class-member-order": "off",

      // Keep explicit property access in the game rules and event handlers.
      "unicorn/consistent-destructuring": "off",

      // Ordered hands and action queues intentionally insert and remove their first element.
      "unicorn/no-array-front-mutation": "off",

      // Keep nearby declarations in the game rules and event handlers.
      "unicorn/no-declarations-before-early-exit": "off",

      // Keep explicit branches and comparisons in the game rules and event handlers.
      "unicorn/no-duplicate-if-branches": "off",

      // Application entry points initialize shared state at module scope.
      "unicorn/no-global-object-property-assignment": "off",

      // Names follow the existing UI style.
      "unicorn/no-non-function-verb-prefix": "off",

      // Keep explicit comparisons in the game rules and event handlers.
      "unicorn/no-subtraction-comparison": "off",

      // Application entry points initialize shared state and register handlers at module scope.
      "unicorn/no-top-level-assignment-in-function": "off",
      "unicorn/no-top-level-side-effects": "off",

      // Loops and constructor expressions follow the existing UI style.
      "unicorn/no-unreadable-for-of-expression": "off",
      "unicorn/no-unreadable-new-expression": "off",

      // Preserve the existing grouping of fractional drawing coordinates.
      "unicorn/numeric-separators-style": [
        "error",
        { number: { fractionGroupLength: 3 } },
      ],

      // Promise callbacks are used for fire-and-forget operations and CommonJS entry points.
      "unicorn/prefer-await": "off",

      // Keep explicit branches in the game rules and event handlers.
      "unicorn/prefer-continue": "off",
      "unicorn/prefer-early-return": "off",

      // Preserve compatibility with browsers without the newest iterator APIs.
      "unicorn/prefer-iterator-to-array": "off",

      // Keep explicit branches in the game rules and event handlers.
      "unicorn/prefer-logical-operator-over-ternary": "off",

      // Factoring ternaries can erase the correlation between discriminated union members.
      "unicorn/prefer-minimal-ternary": "off",

      // Preserve compatibility with browsers without the newest Set methods.
      "unicorn/prefer-set-methods": "off",

      // Keep explicit branches in the game rules and event handlers.
      "unicorn/prefer-simple-condition-first": "off",
      "unicorn/prefer-ternary": "off",

      // Preserve compatibility with browsers without the newest encoding APIs.
      "unicorn/prefer-uint8array-base64": "off",

      // Keep explicit branches in the game rules and event handlers.
      "unicorn/try-complexity": "off",

      // @template-customization-end
    },
  },

  // @template-customization-start

  // The wire contracts generated from "server/protocol" keep the line breaks of their Rust doc
  // comments, and their enums have the values that the wire sends.
  {
    files: ["**/src/generated/**"],
    rules: {
      "complete/consistent-enum-values": "off",
      "complete/format-jsdoc-comments": "off",
    },
  },

  {
    ignores: [
      "packages/data/src/version.js",
      "packages/game/docs/assets/main.js",
    ],
  },

  // @template-customization-end
);

export default defineConfig(...hanabiConfigBase);
