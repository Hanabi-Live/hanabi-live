import { getVariant } from "@hanabi/data";
import { getPossibilitiesFromKeywords } from "./noteIdentity";

const testVariant = getVariant("Up or Down (5 Suits)");

const zeros = [0, 0, 0, 0, 0, 0];
const ones = [1, 1, 1, 1, 1, 1];
const rankMap = (
  ranks: Set<number>,
  suitLength: number = testVariant.suits.length,
) => {
  const cardMap: number[][] = [];
  for (const rank of [1, 2, 3, 4, 5, 6, 7]) {
    if (ranks.has(rank)) {
      cardMap.push(ones.slice(0, suitLength));
    } else {
      cardMap.push(zeros.slice(0, suitLength));
    }
  }
  return cardMap;
};

function identityArrayToMap(
  possibles: Array<[number, number]>,
  suitLength: number = testVariant.suits.length,
): number[][] {
  const cardMap: number[][] = [];
  for (let rank = 1; rank <= 7; rank++) {
    cardMap.push(zeros.slice(0, suitLength));
  }
  for (const ident of possibles) {
    cardMap[ident[1] - 1]![ident[0]] = 1;
  }
  return cardMap;
}

describe("noteIdentity", () => {
  describe("getPossibilitiesFromKeyword", () => {
    // The note keyword `red` returns `[[0,1], [0,2], [0,3], [0,4], [0,5]]`.
    test("positive suit", () => {
      const possibles = getPossibilitiesFromKeywords(testVariant, ["red"]);
      expect(possibles).toEqual([
        [0, 1],
        [0, 2],
        [0, 3],
        [0, 4],
        [0, 5],
        [0, 7],
      ]);
    });

    // The note keyword `red 3, blue 3` would return `[[0,3], [1,3]]`.
    test("positive", () => {
      const possibles = getPossibilitiesFromKeywords(testVariant, ["r3,bs"]);
      expect(possibles).toEqual([
        [0, 3],
        [3, 7],
      ]);
    });

    test("negative", () => {
      const possibles = getPossibilitiesFromKeywords(testVariant, ["!2, !3"]);
      const identMap = rankMap(new Set([1, 4, 5, 7]));
      expect(identityArrayToMap(possibles)).toEqual(identMap);
    });

    // The note keyword `r,b,2,3` would return all red, blue, 2's OR 3's.
    test("positive suit and rank", () => {
      const possibles = getPossibilitiesFromKeywords(testVariant, ["r,3,b,2"]);
      expect(possibles).toEqual([
        [0, 1],
        [3, 1],
        [0, 2],
        [1, 2],
        [2, 2],
        [3, 2],
        [4, 2],
        [0, 3],
        [1, 3],
        [2, 3],
        [3, 3],
        [4, 3],
        [0, 4],
        [3, 4],
        [0, 5],
        [3, 5],
        [0, 7],
        [3, 7],
      ]);
    });

    // The note keyword `rb23` would return all red, blue, 2's OR 3's.
    test("positive squish", () => {
      const possibles = getPossibilitiesFromKeywords(testVariant, ["r3b2"]);
      expect(possibles).toEqual([
        [0, 2],
        [3, 2],
        [0, 3],
        [3, 3],
      ]);
    });

    // The note keyword `r,!2,!3` would return `[[0,1], [0,4], [0,5]`.
    test("positive and negative", () => {
      const possibles = getPossibilitiesFromKeywords(testVariant, [
        "r, ! 2, !3",
      ]);
      expect(possibles).toEqual([
        [0, 1],
        [0, 4],
        [0, 5],
        [0, 7],
      ]);
    });
  });
});
