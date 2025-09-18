// @ts-check

import { defineConfig } from "eslint/config";
import { hanabiConfigBase } from "../../eslint.config.mjs";

export default defineConfig(
  ...hanabiConfigBase,
  {
    rules: {
      /**
       * Documentation:
       * https://typescript-eslint.io/rules/no-restricted-imports/
       *
       * We copy-paste the existing config and then add a clause for `models`.
       */
      "@typescript-eslint/no-restricted-imports": [
        "error",
        {
          patterns: [
            // Some "src" directories have an "index.ts" file, which means that importing from the
            // directory is valid. Thus, we check for the "src" directory with no suffix.
            {
              group: ["**/src"],
              message:
                'You cannot import from a "src" directory. If this is a monorepo, import using the package name like you would in a non-monorepo project.',
            },

            {
              group: ["**/src/**"],
              message:
                'You cannot import from a "src" directory. If this is a monorepo, import using the package name like you would in a non-monorepo project.',
            },

            // Some "dist" directories have an "index.ts" file, which means that importing from the
            // directory is valid. Thus, we check for the "dist" directory with no suffix.
            {
              group: ["**/dist"],
              message:
                'You cannot import from a "dist" directory. If this is a monorepo, import using the package name like you would in a non-monorepo project.',
            },

            {
              group: ["**/dist/**"],
              message:
                'You cannot import from a "dist" directory. If this is a monorepo, import using the package name like you would in a non-monorepo project.',
            },

            {
              group: ["**/index"],
              message:
                "You cannot import from a package index. Instead, import directly from the file where the code is located.",
            },

            {
              group: ["**/index.{js,cjs,mjs,ts,cts,mts}"],
              message:
                "You cannot import from a package index. Instead, import directly from the file where the code is located.",
            },

            {
              // We want to allow: `import { models } from "./models"`
              group: ["*/models/*"],
              message:
                'You cannot import model functions directly. Use the "models" object instead.',
            },
          ],
        },
      ],

      /**
       * Documentation:
       * https://github.com/IsaacScript/isaacscript/blob/main/packages/eslint-plugin-isaacscript/docs/rules/require-variadic-function-argument.md
       *
       * This rule does not play well with pino.
       */
      "complete/require-variadic-function-argument": "off",
    },
  },

  {
    languageOptions: {
      parserOptions: {
        projectService: {
          allowDefaultProject: ["esbuild.mjs", "eslint.config.mjs"],
          defaultProject: "tsconfig.json",
        },
      },
    },
  },
);
