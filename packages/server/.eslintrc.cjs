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
     * https://typescript-eslint.io/rules/no-restricted-imports/
     *
     * Defined at:
     * https://isaacscript.github.io/eslint-config-isaacscript
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
     * Defined at:
     * https://github.com/IsaacScript/isaacscript/tree/main/packages/eslint-plugin-isaacscript
     *
     * Temporarily disable this rule until the Pino TypeScript definitions are updated:
     * https://github.com/pinojs/pino/issues/1782
     */
    "isaacscript/require-variadic-function-argument": "off",
  },
};
