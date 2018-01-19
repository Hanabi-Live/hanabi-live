module.exports = {
  // The linter base is the airbnb style guide, located here:
  // https://github.com/airbnb/javascript
  "extends": "airbnb-base",

  "env": {
    "es6": true,
    "browser": true,
    "jquery": true,
  },

  // We modify the base for some specific things
  "rules": {
    // airbnb uses 2 spaces, but it is harder to read block intendation at a glance
    "indent": ["warn", 4],

    // Atom's ruler allows for less formal line length validation;
    // in some situations, it introduces unneeded complexity to break up a line
    "max-len": ["off"],

    // The browser JavaScript makes use of tasteful alerts
    "no-alert": ["off"],

    // We need this for debugging
    "no-console": ["off"],

    // Proper use of continues can reduce indentation for long blocks of code
    "no-continue": ["off"],

    // KineticJS's API has functions that are prefixed with an underscore
    "no-underscore-dangle": ["off"],

    // We make sure light use of parameter reassigning where appropriate
    "no-param-reassign": ["off"],

    // airbnb disallows these because it can lead to errors with minified code;
    // we don't have to worry about this in for loops though
    "no-plusplus": ["error", {
        "allowForLoopAfterthoughts": true,
    }],

    // Clean code can arise from for-of statements if used properly
    "no-restricted-syntax": ["off", "ForOfStatement"],

    // Most people turn off this setting
    "no-mixed-operators": ["off"],

    // It can be bad to remove unused arguments from a function copied an API example
    "no-unused-vars": ["warn", {
        "vars": "local",
        "args": "none",
    }],

    // This is recommended here:
    // https://blog.javascripting.com/2015/09/07/fine-tuning-airbnbs-eslint-config/
    // (airbnb doesn't include this by default for some reason)
    "quote-props": ["warn", "consistent-as-needed"],

    // Keldon's original code does this and it would be tricky to refactor
    "no-use-before-define": ["off"],
  },

  "globals": {
      "HanabiUI": true,
      "GameUI": true,
      "constants": true,
      "golem": true,
      "Kinetic": true,
      "hex_sha256": true,
      "TimerDisplay": true,
  },
};
