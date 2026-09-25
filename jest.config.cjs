/** @type {import('ts-jest/dist/types').JestConfigWithTsJest} */
const config = {
  projects: [
    "<rootDir>/packages/client",
    "<rootDir>/packages/game",
    "<rootDir>/packages/server",
  ],
};

module.exports = config;
