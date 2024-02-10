// This is the configuration file for Prettier, the auto-formatter:
// https://prettier.io/docs/en/configuration.html

/** @type {import("prettier").Config} */
const config = {
  plugins: [
    "prettier-plugin-organize-imports", // Prettier does not format imports by default.
    "prettier-plugin-packagejson", // Prettier does not format "package.json" by default.
    // @template-customization-start
    "prettier-plugin-go-template", // Prettier does not format Golang files by default.
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
};

export default config;
