/** @type {import("ts-jest/dist/types").JestConfigWithTsJest} */
const config = {
  testSequencer: "<rootDir>/jest-sequencer.config.cjs",
  projects: [
    "<rootDir>/packages/client",
    "<rootDir>/packages/game",
    "<rootDir>/packages/server",
  ],
};

module.exports = config;
