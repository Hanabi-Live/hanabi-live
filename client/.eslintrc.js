// This is the configuration file for ESLint, the TypeScript linter
// https://eslint.org/docs/user-guide/configuring
module.exports = {
  // This configuration first imports rules from other places
  extends: [
    // The linter base is the Airbnb style guide,
    // which is the most popular JavaScript style guide in the world:
    // https://github.com/airbnb/javascript
    // The actual ESLint config is located here:
    // https://github.com/airbnb/javascript/blob/master/packages/eslint-config-airbnb-base/rules
    // The TypeScript config extends it:
    // https://github.com/iamturns/eslint-config-airbnb-typescript/blob/master/lib/shared.js
    "airbnb-typescript/base",

    // We extend the Airbnb rules with the "recommended" and "recommended-requiring-type-checking"
    // rules from the "typescript-eslint" plugin, which is also recommended by Matt Turnbull,
    // the author of "airbnb-typescript/base"
    // https://github.com/typescript-eslint/typescript-eslint/blob/master/packages/eslint-plugin/src/configs/README.md#recommended
    // https://github.com/typescript-eslint/typescript-eslint/blob/master/packages/eslint-plugin/src/configs/recommended.ts
    // https://github.com/typescript-eslint/typescript-eslint/blob/master/packages/eslint-plugin/src/configs/recommended-requiring-type-checking.ts
    "plugin:@typescript-eslint/recommended",
    "plugin:@typescript-eslint/recommended-requiring-type-checking",

    // We use Prettier to automatically format TypeScript files
    // We want to run Prettier as an ESLint rule so that we can detect non-formatted files in CI
    // https://github.com/prettier/eslint-plugin-prettier
    // https://silvenon.com/blog/integrating-and-enforcing-prettier-and-eslint
    "plugin:prettier/recommended",

    // Disable any ESLint rules that conflict with Prettier
    // (otherwise, we will get duplicate errors with ESLint)
    // https://github.com/prettier/eslint-config-prettier
    "prettier",
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
    project: "./tsconfig.eslint.json",
  },

  ignorePatterns: ["**/webpack_output/**", "**/lib/**"],

  // We modify the linting rules from the base for some specific things
  // (listed in alphabetical order)
  // Note that currently, the "arrow-body-style" rule is bugged:
  // https://github.com/prettier/eslint-config-prettier/blob/master/README.md#arrow-body-style-and-prefer-arrow-callback
  rules: {
    // Documentation:
    // https://github.com/typescript-eslint/typescript-eslint/blob/master/packages/eslint-plugin/docs/rules/array-type.md
    // Not defined in parent configs
    // Prefer the "[]string" syntax over "Array<string>"
    "@typescript-eslint/array-type": ["error", { default: "array-simple" }],

    // Documentation:
    // https://eslint.org/docs/rules/lines-between-class-members
    // https://github.com/typescript-eslint/typescript-eslint/blob/master/packages/eslint-plugin/docs/rules/lines-between-class-members.md
    // Defined at:
    // https://github.com/airbnb/javascript/blob/master/packages/eslint-config-airbnb-base/rules/style.js
    // Airbnb has "exceptAfterSingleLine" turned off by default
    // A list of single-line variable declarations at the top of a class is common in TypeScript
    "@typescript-eslint/lines-between-class-members": [
      "error",
      "always",
      { exceptAfterSingleLine: true },
    ],

    // Documentation:
    // https://github.com/typescript-eslint/typescript-eslint/blob/master/packages/eslint-plugin/docs/rules/no-non-null-assertion.md
    // Defined at:
    // https://github.com/typescript-eslint/typescript-eslint/blob/master/packages/eslint-plugin/src/configs/recommended.ts
    // We use many variables that are only null during initialization;
    // adding explicit type guards would be superfluous
    "@typescript-eslint/no-non-null-assertion": ["off"],

    // Documentation:
    // https://github.com/typescript-eslint/typescript-eslint/blob/master/packages/eslint-plugin/docs/rules/no-use-before-define.md
    // https://eslint.org/docs/rules/no-use-before-define
    // Defined at:
    // https://github.com/airbnb/javascript/blob/master/packages/eslint-config-airbnb-base/rules/variables.js
    // This allows code to be structured in a more logical order
    "@typescript-eslint/no-use-before-define": ["off"],

    // Documentation:
    // https://github.com/typescript-eslint/typescript-eslint/blob/master/packages/eslint-plugin/docs/rules/quotes.md
    // Defined at:
    // https://github.com/prettier/eslint-config-prettier/blob/master/%40typescript-eslint.js
    // In order to forbid unnecessary backticks, we must re-enable the "@typescript-eslint/quotes"
    // rule as specified in the eslint-config-prettier documentation:
    // https://github.com/prettier/eslint-config-prettier#enforce-backticks
    "@typescript-eslint/quotes": [
      "error",
      "double",
      { avoidEscape: true, allowTemplateLiterals: false },
    ],

    // Documentation:
    // https://github.com/typescript-eslint/typescript-eslint/blob/master/packages/eslint-plugin/docs/rules/strict-boolean-expressions.md
    // Not defined in parent configs
    // This prevents comparing false/true to null/undefined
    // We specify "allowAny" because Konva uses them a lot
    "@typescript-eslint/strict-boolean-expressions": [
      "error",
      { allowAny: true },
    ],

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
    // https://eslint.org/docs/rules/no-console
    // Defined at:
    // https://github.com/airbnb/javascript/blob/master/packages/eslint-config-airbnb-base/rules/errors.js
    // We need to output messages to the console for debugging purposes
    "no-console": ["off"],

    // Documentation:
    // https://eslint.org/docs/rules/no-constant-condition
    // Defined at:
    // https://github.com/airbnb/javascript/blob/master/packages/eslint-config-airbnb-base/rules/errors.js
    // We make use of constant while loops where appropriate
    "no-constant-condition": ["off"],

    // Documentation:
    // https://eslint.org/docs/rules/no-continue
    // Defined at:
    // https://github.com/airbnb/javascript/blob/master/packages/eslint-config-airbnb-base/rules/style.js
    // Proper use of continues can reduce indentation for long blocks of code
    "no-continue": "off",

    // Documentation:
    // https://eslint.org/docs/rules/no-param-reassign
    // Defined at:
    // https://github.com/airbnb/javascript/blob/master/packages/eslint-config-airbnb-base/rules/best-practices.js
    // We allow reassigning properties of parameters, but not the parameters themselves
    "no-param-reassign": ["error", { props: false }],

    // Documentation:
    // https://eslint.org/docs/rules/no-plusplus
    // Defined at:
    // https://github.com/airbnb/javascript/blob/master/packages/eslint-config-airbnb-base/rules/style.js
    // Airbnb disallows these because it can lead to errors with minified code;
    // we don't have to worry about this in for loops though
    "no-plusplus": ["error", { allowForLoopAfterthoughts: true }],

    // Documentation:
    // https://eslint.org/docs/rules/no-restricted-syntax
    // Defined at:
    // https://github.com/airbnb/javascript/blob/master/packages/eslint-config-airbnb-base/rules/style.js
    // "for..of" loops are necessary to write efficient code in some situations
    "no-restricted-syntax": "off",

    // Documentation:
    // https://eslint.org/docs/rules/no-underscore-dangle
    // Defined at:
    // https://github.com/airbnb/javascript/blob/master/packages/eslint-config-airbnb-base/rules/style.js
    // KineticJS has functions that are prefixed with an underscore
    "no-underscore-dangle": ["off"],

    // Documentation:
    // https://eslint.org/docs/rules/prefer-destructuring
    // Defined at:
    // https://github.com/airbnb/javascript/blob/master/packages/eslint-config-airbnb-base/rules/es6.js
    // Array destructuring can result in non-intuitive code
    // Keep the Airbnb config for object destructuring
    "prefer-destructuring": [
      "error",
      {
        VariableDeclarator: {
          array: false,
          object: true,
        },
        AssignmentExpression: {
          array: false,
          object: false,
        },
      },
      {
        enforceForRenamedProperties: false,
      },
    ],
  },
};
