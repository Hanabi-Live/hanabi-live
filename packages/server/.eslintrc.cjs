const path = require("node:path");

const REPO_ROOT = path.join(__dirname, "..", "..");

module.exports = {
  extends: [path.join(REPO_ROOT, ".eslintrc.cjs")],

  parserOptions: {
    project: path.join(__dirname, "tsconfig.eslint.json"),
  },

  rules: {
    // Temporarily disable this rule until the Pino TypeScript definitions are updated:
    // https://github.com/pinojs/pino/issues/1782
    "isaacscript/require-variadic-function-argument": "off",
  },
};
