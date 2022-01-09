/* eslint-disable import/no-extraneous-dependencies */
import type { Config } from "@jest/types";
import { pathsToModuleNameMapper } from "ts-jest";
// Load the config which holds the path aliases.
import { loadSync } from "tsconfig";

const tsconfig = loadSync("./tsconfig.json").config;

const config: Config.InitialOptions = {
  preset: "ts-jest",

  moduleNameMapper: pathsToModuleNameMapper(tsconfig.compilerOptions.paths, {
    prefix: "<rootDir>/../../packages/",
  }),

  testEnvironment: "node",
};

export default config;
