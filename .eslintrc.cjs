// This is the configuration file for ESLint, the TypeScript linter:
// https://eslint.org/docs/latest/use/configure/

/** @type {import("eslint").Linter.Config} */
const config = {
  extends: [
    // The linter base is the shared IsaacScript config:
    // https://github.com/IsaacScript/isaacscript/blob/main/packages/eslint-config-isaacscript/configs/base.js
    "eslint-config-isaacscript/base",
  ],

  // Don't bother linting the compiled output.
  // @template-ignore-next-line
  ignorePatterns: ["**/dist/**", "**/lib/**", "**/version.js"],

  parserOptions: {
    // ESLint needs to know about the project's TypeScript settings in order for TypeScript-specific
    // things to lint correctly. We do not point this at "./tsconfig.json" because certain files
    // (such at this file) should be linted but not included in the actual project output.
    project: "./tsconfig.eslint.json",
  },

  rules: {
    // Insert changed or disabled rules here, if necessary.
    // @template-customization-start

    /**
     * Documentation:
     * https://eslint.org/docs/latest/rules/func-style
     *
     * Not defined in the parent configs.
     *
     * Enforce the "normal" function style throughout the entire project.
     */
    "func-style": ["error", "declaration"],

    /**
     * Documentation:
     * https://typescript-eslint.io/rules/no-restricted-imports
     *
     * Not defined in the parent configs.
     */
    "@typescript-eslint/no-restricted-imports": [
      "error",
      {
        patterns: [
          {
            // We don't use a suffix or a prefix since some "src" folders have an "index.ts" file.
            group: ["*src*"],
            message:
              'You cannot import directly from other packages in the monorepo. Configure the entity such that it is exported from the root of the project and then use a "@hanabi/foo" style import.',
          },

          {
            group: ["*/index*"],
            message:
              "You cannot import directly from a package index. Instead, import directly from the file where the code is located.",
          },

          // This only applies to the server, but we put it here to avoid having to duplicate the
          // above rule.
          {
            // We want to allow: `import { models } from "./models"`
            group: ["*/models/*"],
            message:
              'You cannot import model functions directly. Use the "models" object instead.',
          },
        ],
      },
    ],

    /**
     * Documentation:
     * https://github.com/IsaacScript/isaacscript/blob/main/packages/eslint-plugin-isaacscript/docs/rules/no-number-enums.md
     *
     * Defined at:
     * https://isaacscript.github.io/eslint-config-isaacscript
     *
     * We use number enums to save bandwidth between client and server. Number enums are almost
     * always safe with the `isaacscript/strict-enums` rule.
     */
    "@typescript-eslint/prefer-enum-initializers": "off",

    /**
     * Documentation:
     * https://github.com/IsaacScript/isaacscript/blob/main/packages/eslint-plugin-isaacscript/docs/rules/no-number-enums.md
     *
     * Defined at:
     * https://isaacscript.github.io/eslint-config-isaacscript
     *
     * We use number enums to save bandwidth between client and server. Number enums are almost
     * always safe with the `isaacscript/strict-enums` rule.
     */
    "isaacscript/no-number-enums": "off",

    /**
     * Documentation:
     * https://github.com/mysticatea/eslint-plugin-node/blob/master/docs/rules/file-extension-in-import.md
     *
     * Defined at:
     * https://isaacscript.github.io/eslint-config-isaacscript
     *
     * Keep this rule disabled until the project can be moved to ESM (which is contingent upon the
     * dependencies being up to date).
     */
    "n/file-extension-in-import": "off",

    /**
     * Documentation:
     * https://github.com/sindresorhus/eslint-plugin-unicorn/blob/main/docs/rules/prefer-module.md
     *
     * Defined at:
     * https://isaacscript.github.io/eslint-config-isaacscript
     *
     * Keep this rule disabled until the project can be moved to ESM (which is contingent upon the
     * dependencies being up to date).
     */
    "unicorn/prefer-module": "off",

    /**
     * Documentation:
     * https://github.com/sindresorhus/eslint-plugin-unicorn/blob/main/docs/rules/prefer-top-level-await.md
     *
     * Defined at:
     * https://isaacscript.github.io/eslint-config-isaacscript
     *
     * Keep this rule disabled until the project can be moved to ESM (which is contingent upon the
     * dependencies being up to date).
     */
    "unicorn/prefer-top-level-await": "off",

    // @template-customization-end
  },
};

module.exports = config;
