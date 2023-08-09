// This is the configuration file for ESLint, the TypeScript linter:
// https://eslint.org/docs/user-guide/configuring
module.exports = {
  extends: [
    // The linter base is the shared IsaacScript config:
    // https://github.com/IsaacScript/isaacscript/blob/main/packages/eslint-config-isaacscript/configs/base.js
    "eslint-config-isaacscript/base",
  ],

  parserOptions: {
    // ESLint needs to know about the project's TypeScript settings in order for TypeScript-specific
    // things to lint correctly. We do not point this at "./tsconfig.json" because certain files
    // (such at this file) should be linted but not included in the actual project output.
    project: ["./tsconfig.eslint.json"],
  },

  ignorePatterns: ["**/lib/**", "**/version.js"],

  rules: {
    /**
     * Documentation:
     * https://eslint.org/docs/latest/rules/func-style
     *
     * Defined at:
     * https://isaacscript.github.io/eslint-config-isaacscript
     *
     * Enforce the "normal" function style throughout the entire project.
     */
    "func-style": ["error", "declaration"],

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
  },
};
