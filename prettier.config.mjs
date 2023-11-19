// This is the configuration file for Prettier, the auto-formatter:
// https://prettier.io/docs/en/configuration.html

/** @type {import("prettier").Config} */
const config = {
  // @template-ignore-next-line
  plugins: ["prettier-plugin-organize-imports", "prettier-plugin-go-template"],

  overrides: [
    // Allow proper formatting of JSONC files:
    // https://github.com/prettier/prettier/issues/5708
    {
      files: [
        "**/*.jsonc",
        "**/.vscode/*.json",
        "**/tsconfig.json",
        "**/tsconfig.*.json",
      ],
      options: {
        parser: "json5",
        quoteProps: "preserve",
      },
    },
  ],
};

export default config;
