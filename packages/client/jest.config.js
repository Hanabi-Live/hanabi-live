const fs = require("node:fs");
const path = require("node:path");
const jsoncParser = require("jsonc-parser");
const { pathsToModuleNameMapper } = require("ts-jest");

// Read and parse the compiler options from the "tsconfig.json" file.
const tsconfigPath = path.join(__dirname, "tsconfig.json");
if (!fs.existsSync(tsconfigPath)) {
  throw new Error(`The "${tsconfigPath}" file does not exist.`);
}
const tsconfigString = fs.readFileSync(tsconfigPath).toString().trim();
const tsconfig = jsoncParser.parse(tsconfigString);
const { compilerOptions } = tsconfig;

module.exports = {
  preset: "ts-jest",
  testEnvironment: "node",
  moduleNameMapper: pathsToModuleNameMapper(compilerOptions.paths, {
    prefix: "<rootDir>/../../packages/",
  }),
};
