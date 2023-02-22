const fs = require("node:fs");
const path = require("node:path");
const jsoncParser = require("jsonc-parser");
const { pathsToModuleNameMapper } = require("ts-jest");

// Read and parse the compiler options from the "tsconfig.json" file.
const repoRootPath = path.join(__dirname, "..", "..");
const monorepoTSConfigPath = path.join(repoRootPath, "tsconfig.monorepo.json");
if (!fs.existsSync(monorepoTSConfigPath)) {
  throw new Error(`The "${monorepoTSConfigPath}" file does not exist.`);
}
const tsconfigString = fs.readFileSync(monorepoTSConfigPath).toString().trim();
const tsconfig = jsoncParser.parse(tsconfigString);

module.exports = {
  preset: "ts-jest",
  testEnvironment: "node",

  // From: https://kulshekhar.github.io/ts-jest/docs/getting-started/paths-mapping/
  roots: ["<rootDir>"],
  modulePaths: [tsconfig.compilerOptions.baseUrl],
  moduleNameMapper: pathsToModuleNameMapper(tsconfig.compilerOptions.paths, {
    prefix: "<rootDir>/../../",
  }),
};
