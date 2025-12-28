const fs = require("node:fs");
const path = require("node:path");
const jsoncParser = require("jsonc-parser");
const { pathsToModuleNameMapper } = require("ts-jest");

// Read and parse the compiler options from the "tsconfig.json" file.
const REPO_ROOT = path.resolve(__dirname, "..", "..");
const MONOREPO_TS_CONFIG = path.join(REPO_ROOT, "tsconfig.monorepo.json");
if (!fs.existsSync(MONOREPO_TS_CONFIG)) {
  throw new Error(`The "${MONOREPO_TS_CONFIG}" file does not exist.`);
}

const tsconfigString = fs.readFileSync(MONOREPO_TS_CONFIG).toString().trim();
const tsconfig = jsoncParser.parse(tsconfigString);

/** @type {import("ts-jest/dist/types").JestConfigWithTsJest} */
const config = {
  preset: "ts-jest",
  testEnvironment: "node",

  // From: https://kulshekhar.github.io/ts-jest/docs/getting-started/paths-mapping/
  roots: ["<rootDir>"],
  modulePaths: [tsconfig.compilerOptions.baseUrl],
  moduleNameMapper: pathsToModuleNameMapper(tsconfig.compilerOptions.paths, {
    prefix: "<rootDir>/../../",
  }),
};

module.exports = config;
