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
      // Built with esbuild and Grunt from shell scripts.
      entry: [
        "Gruntfile.js",
        "src/main.ts",
        "src/standalone/pips-reference.ts",
      ],
      ignore: [
        "test_data/hanabLiveStateToCurrentRepoState.js", // Pasted into the browser console.
      ],
      ignoreDependencies: [
        "esbuild", // Used in shell scripts.
        "grunt", // Used in shell scripts.
        "grunt-contrib-concat", // Loaded by "Gruntfile.js".
        "grunt-contrib-cssmin", // Loaded by "Gruntfile.js".
        "grunt-criticalcss", // Loaded by "Gruntfile.js".
      ],
    },
    "packages/scripts": {
      // Run from the root "package.json" scripts.
      entry: [
        "src/createVariantsJSON/checkVariantFiles.ts",
        "src/createVariantsJSON/createVariantsJSONScript.ts",
        "src/lintPackageJSON.mts",
        "src/update.mts",
      ],
    },
    "packages/testing": {
      // Run from the root "package.json" test script.
      entry: ["src/mainProcessSetup.ts"],
    },
  },

  ignoreBinaries: [
    "redis-server", // A system binary.
  ],

  ignoreDependencies: [
    "complete-cli", // Used in "check-templates.sh".
    "complete-lint", // This is a linting meta-package.
    "eslint-config-complete", // Provided by "complete-lint".
    "prettier-plugin-organize-imports", // Provided by "complete-lint".
    "prettier-plugin-packagejson", // Provided by "complete-lint".
    "stacktracify", // Used in "stack-trace.sh".
    "ts-prune-2", // Used in "packages/client/lint.sh".
  ],
};

export default config;
