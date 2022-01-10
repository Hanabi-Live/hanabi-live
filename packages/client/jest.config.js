/* eslint-disable @typescript-eslint/no-var-requires */

const fs = require("fs");
const jsoncParser = require("jsonc-parser");
const path = require("path");
const { pathsToModuleNameMapper } = require("ts-jest");

// Read and parse the compiler options from the "tsconfig.json" file
const repoRootPath = path.join(__dirname, "..", "..");
const tsconfigPath = path.join(repoRootPath, "tsconfig.json");
if (!fs.existsSync(tsconfigPath)) {
  throw new Error(`The "${tsconfigPath}" file does not exist.`);
}
const tsconfigString = fs.readFileSync(tsconfigPath).toString().trim();
const tsconfig = jsoncParser.parse(tsconfigString);
const { compilerOptions } = tsconfig;

module.exports = {
  projects: ["<rootDir>/packages/client"],
  preset: "ts-jest",
  testEnvironment: "node",
  moduleNameMapper: pathsToModuleNameMapper(compilerOptions.paths, {
    prefix: "<rootDir>/../../packages/",
  }),
};
