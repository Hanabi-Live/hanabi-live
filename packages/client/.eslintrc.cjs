const path = require("node:path");

const REPO_ROOT = path.join(__dirname, "..", "..");

module.exports = {
  extends: [path.join(REPO_ROOT, ".eslintrc.cjs")],

  parserOptions: {
    project: path.join(__dirname, "tsconfig.eslint.json"),
  },

  rules: {
    // TODO: remove these lines
    "no-useless-call": "off",
    "unicorn/no-lonely-if": "off",
    "unicorn/no-negated-condition": "off",
    "unicorn/no-new-array": "off",
    "unicorn/prefer-string-replace-all": "off",
    "unicorn/prefer-switch": "off",

    /**
     * Documentation:
     * https://eslint.org/docs/rules/no-param-reassign
     *
     * Defined at:
     * https://isaacscript.github.io/eslint-config-isaacscript
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
     * Defined at:
     * https://isaacscript.github.io/eslint-config-isaacscript
     *
     * KineticJS has functions that are prefixed with an underscore.
     */
    "no-underscore-dangle": "off",

    /**
     * Documentation:
     * https://github.com/typescript-eslint/typescript-eslint/blob/master/packages/eslint-plugin/docs/rules/no-non-null-assertion.md
     *
     * Defined at:
     * https://isaacscript.github.io/eslint-config-isaacscript
     *
     * We use many variables that are only null during initialization; adding explicit type guards
     * would be superfluous.
     */
    "@typescript-eslint/no-non-null-assertion": "off",

    /**
     * Documentation:
     * https://github.com/gund/eslint-plugin-deprecation
     *
     * Defined at:
     * https://isaacscript.github.io/eslint-config-isaacscript
     *
     * We use a lot of deprecated JQuery methods. If they are removed from the latest version of
     * JQuery, then we will stick with using an older version.
     */
    "deprecation/deprecation": "off",

    /**
     * Documentation:
     * https://github.com/benmosher/eslint-plugin-import/blob/master/docs/rules/no-cycle.md
     *
     * Defined at:
     * https://isaacscript.github.io/eslint-config-isaacscript
     *
     * The client uses cyclical dependencies because various objects are attached to the global
     * variables object, but methods of these objects also reference/change global variables.
     */
    "import/no-cycle": "off",

    /**
     * Documentation:
     * https://github.com/sindresorhus/eslint-plugin-unicorn/blob/main/docs/rules/no-null.md
     *
     * Defined at:
     * https://isaacscript.github.io/eslint-config-isaacscript
     *
     * The codebase uses many cases of null. In the long term, this should be refactored to
     * undefined where possible. (We want to wait until the server is rewritten in TypeScript first
     * to avoid having to make changes to Golang code.)
     */
    "unicorn/no-null": "off",

    /**
     * Documentation:
     * https://github.com/sindresorhus/eslint-plugin-unicorn/blob/main/docs/rules/no-array-reduce.md
     *
     * Defined at:
     * https://isaacscript.github.io/eslint-config-isaacscript
     *
     * We use reducers in the client for state management.
     */
    "unicorn/no-array-reduce": "off",
  },
};
