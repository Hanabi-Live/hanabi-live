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
     * https://github.com/IsaacScript/isaacscript/blob/main/packages/eslint-config-isaacscript/configs/base-typescript-eslint.js
     *
     * We copy-paste the existing config and then add a clause for this package.
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
            group: ["@hanabi/utils"],
            message:
              "You cannot import from this package. Use a relative import import.",
          },
        ],
      },
    ],
  },
};
