module.exports = {
  // The linter base is the Airbnb style guide, located here:
  // https://github.com/airbnb/javascript
  // The actual ESLint config is located here:
  // https://github.com/airbnb/javascript/blob/master/packages/eslint-config-airbnb-base/rules
  extends: 'airbnb-typescript/base',

  env: {
    browser: true,
    jquery: true,
  },

  // We need to specify some additional settings in order to make the linter work with TypeScript:
  // https://medium.com/@myylow/how-to-keep-the-airbnb-eslint-config-when-moving-to-typescript-1abb26adb5c6
  parser: '@typescript-eslint/parser',
  parserOptions: {
    project: './tsconfig.json',
  },
  plugins: [
    '@typescript-eslint',
    'import',
  ],
  settings: {
    'import/extensions': ['.ts'],
    'import/parsers': {
      '@typescript-eslint/parser': ['.ts'],
    },
    'import/resolver': {
      'typescript': {},
    },
  },

  // We modify the linting rules from the base for some specific things
  // (listed in alphabetical order)
  rules: {
    // Prefer the "[]string" syntax over "Array<string>"
    '@typescript-eslint/array-type': ['error', { default: 'array-simple' }],

    // Temp rules until airbnb-typescript can be updated
    '@typescript-eslint/camelcase': 'off',

    // Airbnb has "exceptAfterSingleLine" turned off by default
    // A list of single-line variable declarations at the top of a class is common in TypeScript
    // https://github.com/airbnb/javascript/blob/master/packages/eslint-config-airbnb-base/rules/style.js#L183
    '@typescript-eslint/lines-between-class-members': ['error', 'always', { exceptAfterSingleLine: true }],

    // Enforce semi-colons inside interface and type declarations
    // https://github.com/typescript-eslint/typescript-eslint/blob/master/packages/eslint-plugin/docs/rules/semi.md
    '@typescript-eslint/member-delimiter-style': ['error'],

    // Keep the code a bit less verbose by removing inferrable type annotations
    '@typescript-eslint/no-inferrable-types': ['error', { ignoreParameters: true, ignoreProperties: true }],

    // No "any" types
    '@typescript-eslint/no-unsafe-assignment': ['error'],
    '@typescript-eslint/no-unsafe-call': ['error'],
    '@typescript-eslint/no-unsafe-member-access': ['error'],
    '@typescript-eslint/no-unsafe-return': ['error'],

    // This allows code to be structured in a more logical order
    // https://github.com/airbnb/javascript/blob/master/packages/eslint-config-airbnb-base/rules/variables.js#L42
    '@typescript-eslint/no-use-before-define': ['off'],

    // Prevent using falsy/truthy to compare against null/undefined
    // https://github.com/typescript-eslint/typescript-eslint/blob/master/packages/eslint-plugin/docs/rules/strict-boolean-expressions.md
    // We allow 'any' values because Konva uses them a lot.
    '@typescript-eslint/strict-boolean-expressions': ['error', { allowAny: true }],

    // ESLint does not like TypeScript 3.8 syntax, e.g. "import { module } from 'file'"
    'import/named': ['off'],

    // The codebase uses cyclical dependencies because
    // various objects are attached to the global variables object,
    // but methods of these objects also reference/change global variables
    // https://github.com/airbnb/javascript/blob/master/packages/eslint-config-airbnb-base/rules/imports.js#L236
    'import/no-cycle': ['off'],

    // We want imports to be sorted alphabetically; this is not specified in the Airbnb config
    // https://github.com/airbnb/javascript/blob/master/packages/eslint-config-airbnb-base/rules/imports.js#L148
    'import/order': ['error', {
      groups: [['builtin', 'external', 'internal']],
      alphabetize: { order: 'asc', caseInsensitive: true },
    }],

    // The client makes use of some tasteful alerts
    // https://github.com/airbnb/javascript/blob/master/packages/eslint-config-airbnb-base/rules/best-practices.js#L59
    'no-alert': ['off'],

    // We need to output messages to the console for debugging
    // https://github.com/airbnb/javascript/blob/master/packages/eslint-config-airbnb-base/rules/errors.js#L27
    'no-console': ['off'],

    // We make use of constant while loops where appropriate
    // https://github.com/airbnb/javascript/blob/master/packages/eslint-config-airbnb-base/rules/errors.js#L30
    'no-constant-condition': ['off'],

    // Proper use of continues can reduce indentation for long blocks of code
    // https://github.com/airbnb/javascript/blob/master/packages/eslint-config-airbnb-base/rules/style.js#L279
    'no-continue': ['off'],

    // Airbnb disallows mixing * and /, which is fairly nonsensical
    // https://github.com/airbnb/javascript/blob/master/packages/eslint-config-airbnb-base/rules/style.js#L290
    'no-mixed-operators': ['error', { allowSamePrecedence: true }],

    // The Airbnb configuration allows 2 empty lines in a row, which is unneeded
    // Additionally, the Airbnb configuration is bugged and
    // allows a line at the beginning of the file
    // https://github.com/airbnb/javascript/blob/master/packages/eslint-config-airbnb-base/rules/style.js#L316
    'no-multiple-empty-lines': ['error', { max: 1, maxBOF: 0, maxEOF: 0 }],

    // We allow reassigning properties of parameters, but not the parameters themselves
    // https://github.com/airbnb/javascript/blob/master/packages/eslint-config-airbnb-base/rules/best-practices.js#L195
    'no-param-reassign': ['error', { props: false }],

    // Airbnb disallows these because it can lead to errors with minified code;
    // we don't have to worry about this in for loops though
    // https://github.com/airbnb/javascript/blob/master/packages/eslint-config-airbnb-base/rules/style.js#L330
    'no-plusplus': ['error', { 'allowForLoopAfterthoughts': true }],

    // Clean code can arise from for-of statements if used properly
    // https://github.com/airbnb/javascript/blob/master/packages/eslint-config-airbnb-base/rules/style.js#L334
    'no-restricted-syntax': ['off', 'ForOfStatement'],

    // KineticJS has functions that are prefixed with an underscore
    // (remove this once the code base is transitioned to Phaser)
    // https://github.com/airbnb/javascript/blob/master/packages/eslint-config-airbnb-base/rules/style.js#L371
    'no-underscore-dangle': ['off'],

    // Array destructuring can result in non-intuitive code
    // Object destructuring is disgustingly verbose in TypeScript
    // e.g. "const foo: string = bar.foo;" vs "const { foo }: { foo: string } = bar;"
    // https://github.com/airbnb/javascript/blob/master/packages/eslint-config-airbnb-base/rules/es6.js#L114
    'prefer-destructuring': ['off'],

    // This allows for cleaner looking code as recommended here:
    // https://blog.javascripting.com/2015/09/07/fine-tuning-airbnbs-eslint-config/
    // https://github.com/airbnb/javascript/blob/master/packages/eslint-config-airbnb-base/rules/style.js#L448
    'quote-props': ['error', 'consistent-as-needed'],
  },
};
