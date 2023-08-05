const path = require("node:path");

const REPO_ROOT = path.join(__dirname, "..", "..");

module.exports = {
  extends: [path.join(REPO_ROOT, ".eslintrc.cjs")],

  parserOptions: {
    project: path.join(__dirname, "tsconfig.eslint.json"),
  },

  rules: {
    /**
     * Documentation:
     * https://github.com/typescript-eslint/typescript-eslint/blob/master/packages/eslint-plugin/docs/rules/no-non-null-assertion.md
     *
     * Defined at: https://isaacscript.github.io/eslint-config-isaacscript
     *
     * We use many variables that are only null during initialization; adding explicit type guards
     * would be superfluous.
     */
    "@typescript-eslint/no-non-null-assertion": ["off"],

    /**
     * Documentation:
     * https://typescript-eslint.io/rules/prefer-enum-initializers/
     *
     * Defined in: https://isaacscript.github.io/eslint-config-isaacscript
     *
     * We use number enums in this project so that the client and server match. (In Golang, enums
     * are conventionally integers.)
     */
    "@typescript-eslint/prefer-enum-initializers": "off",

    /**
     * Documentation:
     * https://github.com/benmosher/eslint-plugin-import/blob/master/docs/rules/no-cycle.md
     *
     * Defined at: https://isaacscript.github.io/eslint-config-isaacscript
     *
     * The codebase uses cyclical dependencies because various objects are attached to the global
     * variables object, but methods of these objects also reference/change global variables.
     */
    "import/no-cycle": ["off"],

    /**
     * Documentation:
     * https://github.com/benmosher/eslint-plugin-import/blob/master/docs/rules/no-named-as-default.md
     *
     * Defined at: https://isaacscript.github.io/eslint-config-isaacscript
     *
     * Immer uses this import style.
     */
    "import/no-named-as-default": "off",

    /**
     * Documentation:
     * https://github.com/mysticatea/eslint-plugin-node/blob/master/docs/rules/file-extension-in-import.md
     *
     * Defined at: https://isaacscript.github.io/eslint-config-isaacscript
     *
     * Keep this rule disabled until the project can be tested to see if it can move to ESM (which
     * is contingent upon the dependencies being up to date).
     */
    "n/file-extension-in-import": "off",

    /**
     * Documentation:
     * https://github.com/sindresorhus/eslint-plugin-unicorn/blob/main/docs/rules/no-null.md
     *
     * Defined in: https://isaacscript.github.io/eslint-config-isaacscript
     *
     * We use lots of `null` for the time being. We can enable this rule in the far future.
     */
    "unicorn/no-null": "off",

    /**
     * Documentation:
     * https://github.com/gund/eslint-plugin-deprecation
     *
     * Defined in: https://isaacscript.github.io/eslint-config-isaacscript
     *
     * We use a lot of deprecated JQuery methods. If they are removed from the latest version of
     * JQuery, then we will stick with using an older version.
     */
    "deprecation/deprecation": "off",

    /**
     * Documentation:
     * https://github.com/IsaacScript/isaacscript/blob/main/packages/eslint-plugin-isaacscript/docs/rules/no-number-enums.md
     *
     * Defined in: https://isaacscript.github.io/eslint-config-isaacscript
     *
     * We use number enums in this project so that the client and server match. (In Golang, enums
     * are conventionally integers.)
     */
    "isaacscript/no-number-enums": "off",

    /**
     * Documentation:
     * https://eslint.org/docs/rules/no-param-reassign
     *
     * Defined in: https://isaacscript.github.io/eslint-config-isaacscript
     *
     * We allow reassigning properties of parameters, but not the parameters themselves.
     */
    "no-param-reassign": [
      "error",
      {
        props: false,
      },
    ],

    /**
     * Documentation:
     * https://eslint.org/docs/rules/no-underscore-dangle
     *
     * Defined in: https://isaacscript.github.io/eslint-config-isaacscript
     *
     * KineticJS has functions that are prefixed with an underscore.
     */
    "no-underscore-dangle": ["off"],

    // TODO REMOVE
    "@typescript-eslint/consistent-type-imports": "off",
  },
};
