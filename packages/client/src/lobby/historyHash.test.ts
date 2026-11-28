import { expect, test } from "vitest";
import { getOtherScoresHash, getOtherScoresSeed } from "./historyHash.ts";

test("reads the seed that a hash of other scores holds", () => {
  expect(getOtherScoresSeed(getOtherScoresHash("p2v0s a/b"))).toBe("p2v0s a/b");
  expect(getOtherScoresSeed("#history")).toBeUndefined();
});

test("a hash that is not a valid encoding has no seed", () => {
  expect(getOtherScoresSeed("#history-other-scores-%")).toBeUndefined();
});
