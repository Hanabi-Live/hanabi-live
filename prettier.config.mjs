// This is the configuration file for Prettier, the auto-formatter:
// https://prettier.io/docs/en/configuration.html

/** @type {import("prettier").Config} */
const config = {
  plugins: ["prettier-plugin-organize-imports"],

  overrides: [
    // Allow proper formatting of JSONC files:
    // https://github.com/prettier/prettier/issues/5708
    {
      files: ["**/.vscode/*.json", "**/tsconfig.json", "**/tsconfig.*.json"],
      options: {
        parser: "json5",
        quoteProps: "preserve",
      },
    },
  ],
};

export default config;
