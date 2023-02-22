const path = require("node:path");

const REPO_ROOT = path.join(__dirname, "..", "..");

module.exports = {
  extends: [path.join(REPO_ROOT, ".eslintrc.cjs")],

  env: {
    jquery: true,
  },

  parserOptions: {
    project: path.join(__dirname, "tsconfig.eslint.json"),
  },
};
