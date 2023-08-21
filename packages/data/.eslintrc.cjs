const path = require("node:path");

const REPO_ROOT = path.join(__dirname, "..", "..");

module.exports = {
  extends: [path.join(REPO_ROOT, ".eslintrc.cjs")],

  parserOptions: {
    project: path.join(__dirname, "tsconfig.eslint.json"),
  },

  rules: {
    // We need to update the `import/no-internal-modules` rule to allow this package to import from
    // itself.
    "import/no-internal-modules": [
      "error",
      {
        forbid: ["**/utils/src/**"],
      },
    ],
  },
};
