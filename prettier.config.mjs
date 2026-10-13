// This is the configuration file for Prettier, the auto-formatter:
// https://prettier.io/docs/en/configuration.html

// @ts-check

/* eslint perfectionist/sort-arrays: ["error", { "useConfigurationIf": { "matchesAstSelector": "ArrayExpression" } }] */

/** @type {import("prettier").Config} */
const config = {
  overrides: [
    // Allow proper formatting of JSONC files that have JSON file extensions.
    {
      files: ["**/.vscode/*.json", "**/tsconfig.*.json", "**/tsconfig.json"],
      options: {
        parser: "jsonc",
      },
    },
    // By default, Prettier will not break long lines in Markdown files:
    // https://prettier.io/docs/options#prose-wrap
    // We only want this setting to apply to Markdown files because it causes weird glitches in YAML
    // files.
    {
      files: ["**/*.md"],
      options: {
        proseWrap: "always",
      },
    },
  ],

  plugins: [
    "prettier-plugin-organize-imports", // Prettier does not format imports by default.
    "prettier-plugin-packagejson", // Prettier does not format "package.json" by default.
    // @template-customization-start
    "prettier-plugin-go-template", // Prettier does not format Golang files by default.
    "prettier-plugin-sh", // Prettier does not format Bash files by default.
    // @template-customization-end
  ],

  // We break from the default Prettier config for only a single option: operator position. There
  // are no known arguments for placing operators at the end of the line, as outlined in this
  // thread: https://github.com/prettier/prettier/issues/3806
  experimentalOperatorPosition: "start",
};

export default config;
