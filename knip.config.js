// This is the configuration file for Knip:
// https://knip.dev/overview/configuration

// @ts-check

/** @type {import("knip").KnipConfig} */
const config = {
  eslint: {},
  prettier: {},

  workspaces: {
    ".": {
      ignore: [
        "misc/file.ts", // An intentionally empty file for the root "tsconfig.json".
        "public/**", // Vendored libraries and build output.
      ],
    },
    "packages/client": {
      // Built with esbuild from shell scripts; Knip finds the Vite entry point.
      entry: ["src/standalone/*.ts", "src/**/*.test.ts"],
      ignore: [
        "test_data/hanabLiveStateToCurrentRepoState.js", // Pasted into the browser console.
      ],
    },
    "packages/scripts": {
      entry: [
        "src/buildCSS.ts", // Run from shell scripts.
      ],
    },
    "packages/game": {
      entry: ["src/**/*.test.ts"],
    },
    "packages/testing": {
      entry: [
        "src/**/*.test.ts",
        "src/criticalCSS.ts", // Run by "runTests.ts".
        "src/uiScreenshots.ts", // Run by "runTests.ts".
      ],
      // Bun reports "ws" as a built-in module, so Knip cannot see that it is used when running
      // under Bun.
      ignoreDependencies: "Bun" in globalThis ? ["@types/ws", "ws"] : [],
    },
  },

  ignoreDependencies: [
    "complete-cli", // Used in "scripts/lint/check-templates.sh".
    "complete-lint", // This is a linting meta-package.
    "eslint", // Provided by "complete-lint".
    "eslint-config-complete", // Provided by "complete-lint".
    "prettier-plugin-organize-imports", // Provided by "complete-lint".
    "prettier-plugin-packagejson", // Provided by "complete-lint".
  ],
};

export default config;
