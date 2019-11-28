module.exports = {
    // The linter base is the Airbnb style guide, located here:
    // https://github.com/airbnb/javascript
    // The actual ESLint config is located here:
    // https://github.com/airbnb/javascript/blob/master/packages/eslint-config-airbnb-base/rules/style.js
    extends: 'airbnb-typescript/base',

    env: {
        browser: true,
        jquery: true,
    },

    // We need to specify some additional settings in order to make the linter work with TypeScript
    // From: https://medium.com/@myylow/how-to-keep-the-airbnb-eslint-config-when-moving-to-typescript-1abb26adb5c6
    parser: '@typescript-eslint/parser',
    plugins: [ '@typescript-eslint' ],
    settings: {
        'import/extensions': ['.js', '.ts'],
        'import/parsers': {
            '@typescript-eslint/parser': ['.ts']
        },
        'import/resolver': {
            'node': {
                'extensions': ['.js', '.ts']
            }
        }
    },

    // We modify the linting rules from the base for some specific things
    // (listed in alphabetical order)
    rules: {
        // Airbnb uses 2 spaces, but it is harder to read block intendation at a glance
        '@typescript-eslint/indent': ['warn', 4],

        // The Hanabi codebase uses cyclical depedencies because
        // various objects are attached to the global variables object,
        // but methods of these objects also reference/change global variables
        'import/no-cycle': ['off'],

        // Airbnb has "exceptAfterSingleLine" turned off by default
        // A list of single-line variable declarations at the top of a class is common in TypeScript
        'lines-between-class-members': ['error', 'always', {
            exceptAfterSingleLine: true,
        }],

        // The browser JavaScript makes use of tasteful alerts
        'no-alert': ['off'],

        // We need this for debugging
        'no-console': ['off'],

        // We make use of constant while loops where appropriate
        'no-constant-condition': ['off'],

        // Proper use of continues can reduce indentation for long blocks of code
        'no-continue': ['off'],

        // Airbnb disallows mixing * and /, which is fairly nonsensical
        'no-mixed-operators': ['error', {
            allowSamePrecedence: true,
        }],

        // The Airbnb configuration allows 2 empty lines in a row, which is unneeded
        // Additionally, the Airbnb configuration is bugged and
        // allows a line at the beginning of the file
        'no-multiple-empty-lines': ['error', { max: 1, maxBOF: 0, maxEOF: 0 }],

        // We make use of parameter reassigning where appropriate
        'no-param-reassign': ['off'],

        // Airbnb disallows these because it can lead to errors with minified code;
        // we don't have to worry about this in for loops though
        'no-plusplus': ['error', {
            'allowForLoopAfterthoughts': true,
        }],

        // Clean code can arise from for-of statements if used properly
        'no-restricted-syntax': ['off', 'ForOfStatement'],

        // KineticJS's API has functions that are prefixed with an underscore
        // (remove this once the code base is transitioned to Phaser)
        'no-underscore-dangle': ['off'],

        // This allows code to be structured in a more logical order
        '@typescript-eslint/no-use-before-define': ['off'],

        // Array destructuring can result in non-intuitive code
        // Object destructuring is disgustingly verbose in TypeScript
        // e.g. "const foo: string = bar.foo;" vs "const { foo }: { foo: string } = bar;"
        'prefer-destructuring': ['off'],

        // This allows for cleaner looking code as recommended here:
        // https://blog.javascripting.com/2015/09/07/fine-tuning-airbnbs-eslint-config/
        'quote-props': ['warn', 'consistent-as-needed'],
    },
};
