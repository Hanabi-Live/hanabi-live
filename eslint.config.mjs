// This is the configuration file for ESLint, the TypeScript linter:
// https://eslint.org/docs/latest/use/configure/

// @ts-check

import {
  completeConfigBase,
  completeConfigMonorepo,
} from "eslint-config-complete";
import tseslint from "typescript-eslint";

export const hanabiConfigBase = tseslint.config(
  ...completeConfigBase,
  ...completeConfigMonorepo,

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
       * We use number enums to save bandwidth between client and server. Number enums are almost
       * always safe with the `complete/strict-enums` rule.
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

      /**
       * Documentation:
       * https://github.com/un-ts/eslint-plugin-import-x/blob/master/docs/rules/no-extraneous-dependencies.md
       *
       * We need to whitelist the monorepo packages.
       */
      "import-x/no-extraneous-dependencies": [
        "warn",
        {
          whitelist: [
            "@hanabi-live/data",
            "@hanabi-live/game",
            "eslint-config-complete",
            "typescript-eslint",
          ],
        },
      ],

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

export default tseslint.config(...hanabiConfigBase);
