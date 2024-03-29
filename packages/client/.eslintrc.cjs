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
     * https://typescript-eslint.io/rules/no-non-null-assertion/
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
     * https://github.com/IsaacScript/isaacscript/blob/main/packages/eslint-plugin-isaacscript/docs/rules/require-variadic-function-argument.md
     *
     * Defined at:
     * https://github.com/IsaacScript/isaacscript/tree/main/packages/eslint-plugin-isaacscript
     *
     * Does not work properly with Redux methods.
     */
    "isaacscript/require-variadic-function-argument": "off",

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
  },
};
