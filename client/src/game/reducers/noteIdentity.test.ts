import { getVariant } from "../data/gameData";
import { getPossibilitiesFromKeywords } from "./noteIdentity";

const testVariant = getVariant("Pink & Gray Pink (6 Suits)");

const zeros = [0, 0, 0, 0, 0, 0];
const ones = [1, 1, 1, 1, 1, 1];
const rankMap = (ranks: Set<number>) => {
  const cardMap: number[][] = [];
  for (const rank of [1, 2, 3, 4, 5]) {
    if (ranks.has(rank)) {
      cardMap.push(ones);
    } else {
      cardMap.push(zeros);
    }
  }
  return cardMap;
};

function identityArrayToMap(possibles: Array<[number, number]>): number[][] {
  const cardMap: number[][] = [];
  for (let rank = 1; rank <= 5; rank++) cardMap.push(zeros.slice());
  for (const ident of possibles) {
    cardMap[ident[1] - 1][ident[0]] = 1;
  }
  return cardMap;
}

describe("noteIdentity", () => {
  describe("getPossibilitiesFromKeyword", () => {
    // e.g. the note keyword `red` would return `[[0,1], [0,2], [0,3], [0,4], [0,5]]`
    test("positive suit", () => {
      const possibles = getPossibilitiesFromKeywords(testVariant, ["red"]);
      expect(possibles).toEqual([
        [0, 1],
        [0, 2],
        [0, 3],
        [0, 4],
        [0, 5],
      ]);
    });
    // and the note keyword `red 3, blue 3` would return `[[0,3], [1,3]]`
    test("positive", () => {
      const possibles = getPossibilitiesFromKeywords(testVariant, ["r3,b2"]);
      expect(possibles).toEqual([
        [3, 2],
        [0, 3],
      ]);
    });
    test("negative", () => {
      const possibles = getPossibilitiesFromKeywords(testVariant, ["!2, !3"]);
      const identMap = rankMap(new Set([1, 4, 5]));
      expect(identityArrayToMap(possibles)).toEqual(identMap);
    });
    // and the note keyword `r,b,2,3, blue 3` would return `[[0,2], [1,2], [0,3], [1,3]]`
    test("positive suit and rank", () => {
      const possibles = getPossibilitiesFromKeywords(testVariant, ["r,3,b,2"]);
      expect(possibles).toEqual([
        [0, 2],
        [3, 2],
        [0, 3],
        [3, 3],
      ]);
    });
    // and the note keyword `r,!2,!3` would return `[[0,1], [0,4], [0,5]`
    test("positive and negative", () => {
      const possibles = getPossibilitiesFromKeywords(testVariant, ["r, !2, !3"]);
      expect(possibles).toEqual([
        [0, 1],
        [0, 4],
        [0, 5],
      ]);
    });
  });
});
