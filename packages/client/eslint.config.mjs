import tseslint from "typescript-eslint";
import { hanabiConfigBase } from "../../eslint.config.mjs";

export default tseslint.config(
  ...hanabiConfigBase,

  {
    rules: {
      /**
       * Documentation:
       * https://eslint.org/docs/rules/no-param-reassign
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
       * KineticJS has functions that are prefixed with an underscore.
       */
      "no-underscore-dangle": "off",

      /**
       * Documentation:
       * https://typescript-eslint.io/rules/no-deprecated/
       *
       * We use a lot of deprecated JQuery methods. If they are removed from the latest version of
       * JQuery, then we will stick with using an older version.
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
       * The codebase uses many cases of null. In the long term, this should be refactored to
       * undefined where possible. (We want to wait until the server is rewritten in TypeScript
       * first to avoid having to make changes to Golang code.)
       */
      "unicorn/no-null": "off",
    },
  },

  {
    ignores: ["**/lib/*.js", "**/test_data/*.js"],
  },
);
