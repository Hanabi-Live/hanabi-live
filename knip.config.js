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
      // Built with Grunt and esbuild from shell scripts; Knip finds the Vite entry point.
      entry: [
        "Gruntfile.js",
        "src/standalone/password-reset.ts",
        "src/standalone/pips-reference.ts",
        "src/standalone/public-tables.ts",
        "src/**/*.test.ts",
      ],
      ignore: [
        "test_data/hanabLiveStateToCurrentRepoState.js", // Pasted into the browser console.
      ],
      ignoreDependencies: [
        "grunt", // Used in shell scripts.
        "grunt-criticalcss", // Loaded by "Gruntfile.js".
      ],
    },
    "packages/scripts": {
      entry: [
        "src/buildCSS.mts", // Run from shell scripts.
      ],
    },
    "packages/game": {
      entry: ["src/**/*.test.ts"],
    },
    "packages/testing": {
      entry: ["src/**/*.test.ts"],
      // Bun reports "ws" as a built-in module, so Knip cannot see that it is used when running
      // under Bun.
      ignoreDependencies: "Bun" in globalThis ? ["@types/ws", "ws"] : [],
    },
  },

  ignoreBinaries: [
    "redis-server", // A system binary.
  ],

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
