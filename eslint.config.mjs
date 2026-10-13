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

      /**
       * Documentation:
       * https://eslint.org/docs/latest/rules/func-style
       *
       * Enforce the "normal" function style throughout the entire project.
       */
      "func-style": ["error", "declaration"],

      /**
       * Documentation:
       * https://typescript-eslint.io/rules/prefer-enum-initializers/
       *
       * We intentionally number enums to save bandwidth between the client and server. Number enums
       * are almost always safe with the `complete/strict-enums` rule.
       */
      "@typescript-eslint/prefer-enum-initializers": "off",

      /**
       * Documentation:
       * TODO
       *
       * We use number enums to save bandwidth between client and server. Number enums are almost
       * always safe with the `isaacscript/strict-enums` rule.
       */
      "complete/no-number-enums": "off",

      // State interfaces and third-party declarations intentionally contain mutable fields.
      "complete/type-declaration-immutability": "off",

      // Application entry points initialize shared state and register handlers at module scope.
      "unicorn/no-top-level-side-effects": "off",
      "unicorn/no-top-level-assignment-in-function": "off",
      "unicorn/no-global-object-property-assignment": "off",

      // Preserve compatibility with browsers without the newest collection and encoding APIs.
      "unicorn/prefer-iterator-to-array": "off",
      "unicorn/prefer-set-methods": "off",
      "unicorn/prefer-uint8array-base64": "off",
      "regexp/require-unicode-sets-regexp": "off",

      // Keep domain-specific property ordering and let Prettier format object literals.
      "complete/sort-objects": "off",
      "complete/sort-destructured-properties": "off",
      "complete/consistent-object-braces": "off",

      // Preserve the existing grouping of fractional drawing coordinates.
      "unicorn/numeric-separators-style": [
        "error",
        { number: { fractionGroupLength: 3 } },
      ],

      // Keep explicit branches and nearby declarations in the game rules and event handlers.
      "unicorn/consistent-destructuring": "off",
      "unicorn/no-declarations-before-early-exit": "off",
      "unicorn/prefer-early-return": "off",
      "unicorn/prefer-continue": "off",
      "unicorn/prefer-ternary": "off",
      // Factoring ternaries can erase the correlation between discriminated union members.
      "unicorn/prefer-minimal-ternary": "off",
      "unicorn/prefer-simple-condition-first": "off",
      "unicorn/prefer-logical-operator-over-ternary": "off",
      "unicorn/try-complexity": "off",
      "unicorn/no-duplicate-if-branches": "off",
      "unicorn/no-subtraction-comparison": "off",

      // Promise callbacks are used for fire-and-forget operations and CommonJS entry points.
      "unicorn/prefer-await": "off",

      // Class members, namespace imports, and constructor expressions follow the existing UI style.
      "unicorn/consistent-class-member-order": "off",
      "unicorn/no-non-function-verb-prefix": "off",
      "unicorn/no-unreadable-new-expression": "off",
      "unicorn/no-unreadable-for-of-expression": "off",

      // Ordered hands and action queues intentionally insert and remove their first element.
      "unicorn/no-array-front-mutation": "off",

      // The client uses positional captures in URL, chat, and note parsers.
      "regexp/prefer-named-capture-group": "off",
      // Unicode code point escapes are enforced by Unicorn, including values below 256.
      "regexp/hexadecimal-escape": "off",

      // BEGIN ESM EXCEPTIONS

      /**
       * Documentation:
       * https://github.com/mysticatea/eslint-plugin-node/blob/master/docs/rules/file-extension-in-import.md
       *
       * Keep this rule disabled until the project can be moved to ESM (which is contingent upon the
       * dependencies being up to date).
       */
      "n/file-extension-in-import": "off",

      /**
       * Documentation:
       * https://github.com/sindresorhus/eslint-plugin-unicorn/blob/main/docs/rules/prefer-module.md
       *
       * Keep this rule disabled until the project can be moved to ESM (which is contingent upon the
       * dependencies being up to date).
       */
      "unicorn/prefer-module": "off",

      /**
       * Documentation:
       * https://github.com/sindresorhus/eslint-plugin-unicorn/blob/main/docs/rules/prefer-top-level-await.md
       *
       * Keep this rule disabled until the project can be moved to ESM (which is contingent upon the
       * dependencies being up to date).
       */
      "unicorn/prefer-top-level-await": "off",

      // END ESM EXCEPTIONS

      // @template-customization-end
    },
  },

  // @template-customization-start

  {
    ignores: [
      "packages/data/src/version.js",
      "packages/game/docs/assets/main.js",
    ],
  },

  // @template-customization-end
);

export default defineConfig(...hanabiConfigBase);
