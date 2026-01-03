// This is the configuration file for Prettier, the auto-formatter:
// https://prettier.io/docs/en/configuration.html

// @ts-check

/** @type {import("prettier").Config} */
const config = {
  plugins: [
    "prettier-plugin-organize-imports", // Prettier does not format imports by default.
    "prettier-plugin-packagejson", // Prettier does not format "package.json" by default.
    // @template-customization-start
    "prettier-plugin-go-template", // Prettier does not format Golang files by default.
    "prettier-plugin-sh", // Prettier does not format Bash files by default.
    // @template-customization-end
  ],

  overrides: [
    // Allow proper formatting of JSONC files that have JSON file extensions.
    {
      files: ["**/.vscode/*.json", "**/tsconfig.json", "**/tsconfig.*.json"],
      options: {
        parser: "jsonc",
      },
    },
  ],

  // We break from the default Prettier config for only a single option: operator position. There
  // are no known arguments for placing operators at the end of the line, as outlined in this
  // thread: https://github.com/prettier/prettier/issues/3806
  experimentalOperatorPosition: "start",
};

export default config;
