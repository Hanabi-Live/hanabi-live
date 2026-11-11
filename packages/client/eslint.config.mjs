import { defineConfig } from "eslint/config";
import { hanabiConfigBase } from "../../eslint.config.mjs";

export default defineConfig(
  ...hanabiConfigBase,

  {
    rules: {
      /**
       * Documentation:
       * https://eslint.org/docs/rules/no-param-reassign
       *
       * We allow reassigning properties of parameters, but not the parameters themselves.
       */
      "no-param-reassign": ["error", { props: false }],

      /**
       * Documentation:
       * https://eslint.org/docs/rules/no-underscore-dangle
       *
       * KineticJS has functions that are prefixed with an underscore.
       */
      "no-underscore-dangle": "off",

      /**
       * Documentation:
       * https://typescript-eslint.io/rules/no-deprecated/
       *
       * We use a lot of deprecated jQuery methods. If they are removed from the latest version of
       * jQuery, then we will stick with using an older version.
       */
      "@typescript-eslint/no-deprecated": "off",

      /**
       * Documentation:
       * https://typescript-eslint.io/rules/no-non-null-assertion/
       *
       * We use many variables that are only null during initialization; adding explicit type guards
       * would be superfluous.
       */
      "@typescript-eslint/no-non-null-assertion": "off",

      /**
       * Documentation:
       * TODO
       *
       * Does not work properly with Redux methods.
       */
      "complete/require-variadic-function-argument": "off",

      /**
       * Documentation:
       * https://github.com/un-ts/eslint-plugin-import-x/blob/master/docs/rules/no-cycle.md
       *
       * The client uses cyclical dependencies because various objects are attached to the global
       * variables object, but methods of these objects also reference/change global variables.
       */
      "import-x/no-cycle": "off",

      /**
       * Documentation:
       * https://github.com/sindresorhus/eslint-plugin-unicorn/blob/main/docs/rules/no-null.md
       *
       * The client uses undefined for missing values. The remaining uses of null are for browser,
       * React, and Konva APIs that require it.
       */
      "unicorn/no-null": "off",

      // Konva's children are canvas nodes, not DOM elements.
      "unicorn/better-dom-traversing": "off",

      // Keep HTML serialization compatible with browsers without Element.getHTML.
      "unicorn/prefer-dom-node-html-methods": "off",
    },
  },

  // The standalone pages are bundled as classic scripts, which cannot use top-level await.
  {
    files: ["src/standalone/**"],
    rules: {
      "unicorn/prefer-top-level-await": "off",
    },
  },

  { ignores: ["**/test_data/*.js"] },
);
