const path = require("node:path");

const REPO_ROOT = path.join(__dirname, "..", "..");

module.exports = {
  extends: [path.join(REPO_ROOT, ".eslintrc.cjs")],

  parserOptions: {
    project: path.join(__dirname, "tsconfig.eslint.json"),
  },

  rules: {
    // TODO: Temporarily disable all new rules.
    "@typescript-eslint/class-methods-use-this": "off",
    "@typescript-eslint/lines-around-comment": "off",
    "@typescript-eslint/method-signature-style": "off",
    "@typescript-eslint/no-empty-function": "off",
    "@typescript-eslint/no-redundant-type-constituents": "off",
    "@typescript-eslint/no-unsafe-enum-comparison": "off",
    "@typescript-eslint/prefer-enum-initializers": "off",
    "@typescript-eslint/prefer-nullish-coalescing": "off",
    "@typescript-eslint/prefer-readonly": "off",
    "@typescript-eslint/require-array-sort-compare": "off",
    "@typescript-eslint/restrict-plus-operands": "off",
    "eslint-comments/no-unused-disable": "off",
    "import/no-unassigned-import": "off",
    "isaacscript/no-number-enums": "off",
    "unicorn/better-regex": "off",
    "unicorn/catch-error-name": "off",
    "unicorn/consistent-function-scoping": "off",
    "unicorn/explicit-length-check": "off",
    "unicorn/new-for-builtins": "off",
    "unicorn/no-array-for-each": "off",
    "unicorn/no-array-reduce": "off",
    "unicorn/no-for-loop": "off",
    "unicorn/no-lonely-if": "off",
    "unicorn/no-negated-condition": "off",
    "unicorn/no-new-array": "off",
    "unicorn/no-null": "off",
    "unicorn/no-typeof-undefined": "off",
    "unicorn/no-unused-properties": "off",
    "unicorn/no-useless-spread": "off",
    "unicorn/no-useless-switch-case": "off",
    "unicorn/no-zero-fractions": "off",
    "unicorn/numeric-separators-style": "off",
    "unicorn/prefer-add-event-listener": "off",
    "unicorn/prefer-array-find": "off",
    "unicorn/prefer-array-index-of": "off",
    "unicorn/prefer-array-some": "off",
    "unicorn/prefer-at": "off",
    "unicorn/prefer-date-now": "off",
    "unicorn/prefer-dom-node-append": "off",
    "unicorn/prefer-dom-node-dataset": "off",
    "unicorn/prefer-dom-node-remove": "off",
    "unicorn/prefer-dom-node-text-content": "off",
    "unicorn/prefer-includes": "off",
    "unicorn/prefer-number-properties": "off",
    "unicorn/prefer-optional-catch-binding": "off",
    "unicorn/prefer-prototype-methods": "off",
    "unicorn/prefer-query-selector": "off",
    "unicorn/prefer-set-has": "off",
    "unicorn/prefer-spread": "off",
    "unicorn/prefer-string-replace-all": "off",
    "unicorn/prefer-string-slice": "off",
    "unicorn/prefer-switch": "off",
    "unicorn/prefer-ternary": "off",
    "unicorn/switch-case-braces": "off",
    "logical-assignment-operators": "off",
    "new-cap": "off",
    "no-implicit-coercion": "off",
    "no-useless-call": "off",
    "prefer-destructuring": "off",

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
     * The codebase uses cyclical dependencies because various objects are attached to the global
     * variables object, but methods of these objects also reference/change global variables.
     */
    "import/no-cycle": "off",
  },
};
