const path = require("node:path");
const Sequencer = require("@jest/test-sequencer").default;

// Tiny catalog wrappers otherwise run last under Jest's file-size fallback.
const LONG_TESTS = new Set([
  "gameCatalogA.test.ts",
  "gameCatalogB.test.ts",
  "mainProcess.test.ts",
]);

module.exports = class CriticalPathSequencer extends Sequencer {
  /** @param {Parameters<import("@jest/test-sequencer").default["sort"]>[0]} tests */
  // eslint-disable-next-line complete/no-mutable-return, complete/prefer-readonly-parameter-types -- Jest's sequencer API uses mutable test arrays.
  async sort(tests) {
    const ordered = await super.sort([...tests]);
    return ordered.toSorted(
      (left, right) =>
        Number(LONG_TESTS.has(path.basename(right.path)))
        - Number(LONG_TESTS.has(path.basename(left.path))),
    );
  }
};
