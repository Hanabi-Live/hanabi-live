// This is the configuration file for ESLint, the TypeScript linter
// https://eslint.org/docs/user-guide/configuring
module.exports = {
  extends: [
    // The linter base is the shared IsaacScript config
    // https://github.com/IsaacScript/eslint-config-isaacscript/blob/main/base.js
    "eslint-config-isaacscript/base",
  ],

  env: {
    browser: true,
    jquery: true,
  },

  parserOptions: {
    // ESLint needs to know about the project's TypeScript settings in order for TypeScript-specific
    // things to lint correctly
    // We do not point this at "./tsconfig.json" because certain files (such at this file) should be
    // linted but not included in the actual project output
    project: ["./tsconfig.eslint.json", "./packages/*/tsconfig.json"],
  },

  ignorePatterns: ["**/webpack_output/**", "**/lib/**"],

  // We modify the linting rules from the base for some specific things
  // (listed in alphabetical order)
  rules: {
    // Documentation:
    // https://github.com/typescript-eslint/typescript-eslint/blob/master/packages/eslint-plugin/docs/rules/no-non-null-assertion.md
    // Defined at:
    // https://github.com/typescript-eslint/typescript-eslint/blob/master/packages/eslint-plugin/src/configs/recommended.ts
    // We use many variables that are only null during initialization;
    // adding explicit type guards would be superfluous
    "@typescript-eslint/no-non-null-assertion": ["off"],

    // Documentation:
    // https://github.com/benmosher/eslint-plugin-import/blob/master/docs/rules/no-cycle.md
    // Defined at:
    // https://github.com/airbnb/javascript/blob/master/packages/eslint-config-airbnb-base/rules/imports.js
    // The codebase uses cyclical dependencies because
    // various objects are attached to the global variables object,
    // but methods of these objects also reference/change global variables
    "import/no-cycle": ["off"],

    // Documentation:
    // https://eslint.org/docs/rules/no-alert
    // Defined at:
    // https://github.com/airbnb/javascript/blob/master/packages/eslint-config-airbnb-base/rules/best-practices.js
    // The client makes use of some tasteful alerts
    "no-alert": ["off"],

    // Documentation:
    // https://eslint.org/docs/rules/no-param-reassign
    // Defined at:
    // https://github.com/airbnb/javascript/blob/master/packages/eslint-config-airbnb-base/rules/best-practices.js
    // We allow reassigning properties of parameters, but not the parameters themselves
    "no-param-reassign": ["error", { props: false }],

    // Documentation:
    // https://eslint.org/docs/rules/no-underscore-dangle
    // Defined at:
    // https://github.com/airbnb/javascript/blob/master/packages/eslint-config-airbnb-base/rules/style.js
    // KineticJS has functions that are prefixed with an underscore
    "no-underscore-dangle": ["off"],
  },
};
