import type { SuitRankTuple } from "@hanabi/data";
import { getDefaultVariant, getVariant } from "@hanabi/data";
import { iRange } from "isaacscript-common-ts";
import { getPossibilitiesFromKeywords } from "./noteIdentity";

const DEFAULT_VARIANT = getDefaultVariant();
const UP_OR_DOWN_VARIANT = getVariant("Up or Down (5 Suits)");

const ZEROES = [0, 0, 0, 0, 0, 0] as const;
const ONES = [1, 1, 1, 1, 1, 1] as const;

describe("noteIdentity", () => {
  describe("getPossibilitiesFromKeyword", () => {
    // The note keyword `red` should return `[[0,1], [0,2], [0,3], [0,4], [0,5]]`.
    test("positive suit full", () => {
      const possibilities = getPossibilitiesFromKeywords(DEFAULT_VARIANT, [
        "red",
      ]);
      expect(possibilities).toEqual([
        [0, 1],
        [0, 2],
        [0, 3],
        [0, 4],
        [0, 5],
      ]);
    });

    test("positive suit short", () => {
      const possibilities = getPossibilitiesFromKeywords(DEFAULT_VARIANT, [
        "r",
      ]);
      expect(possibilities).toEqual([
        [0, 1],
        [0, 2],
        [0, 3],
        [0, 4],
        [0, 5],
      ]);
    });

    test("positive suit with Up or Down", () => {
      const possibilities = getPossibilitiesFromKeywords(UP_OR_DOWN_VARIANT, [
        "red",
      ]);
      expect(possibilities).toEqual([
        [0, 1],
        [0, 2],
        [0, 3],
        [0, 4],
        [0, 5],
        [0, 7],
      ]);
    });

    // The note keyword `red 3, blue 3` should return `[[0,3], [3,3]]`.
    test("positive conjunct full", () => {
      const possibilities = getPossibilitiesFromKeywords(DEFAULT_VARIANT, [
        "red 3, blue 3",
      ]);
      expect(possibilities).toEqual([
        [0, 3],
        [3, 3],
      ]);
    });

    test("positive conjunct short", () => {
      const possibilities = getPossibilitiesFromKeywords(DEFAULT_VARIANT, [
        "r3,b3",
      ]);
      expect(possibilities).toEqual([
        [0, 3],
        [3, 3],
      ]);
    });

    test("positive conjunct with Up or Down", () => {
      const possibilities = getPossibilitiesFromKeywords(UP_OR_DOWN_VARIANT, [
        "red 3, blue 3",
      ]);
      expect(possibilities).toEqual([
        [0, 3],
        [3, 3],
      ]);
    });

    // It is not possible to represent "r3,bs" as "red 3, blue start". Thus, we only test the short
    // version.
    test("positive conjunct with START card short", () => {
      const possibilities = getPossibilitiesFromKeywords(UP_OR_DOWN_VARIANT, [
        "r3,bs",
      ]);
      expect(possibilities).toEqual([
        [0, 3],
        [3, 7],
      ]);
    });

    test("negative conjunct", () => {
      const possibilities = getPossibilitiesFromKeywords(DEFAULT_VARIANT, [
        "!2, !3",
      ]);
      const identityMap = getRankMap(
        new Set([1, 4, 5]),
        UP_OR_DOWN_VARIANT.suits.length,
      );
      expect(
        identityArrayToMap(possibilities, UP_OR_DOWN_VARIANT.suits.length),
      ).toEqual(identityMap);
    });

    test("negative conjunct with Up or Down", () => {
      const possibilities = getPossibilitiesFromKeywords(UP_OR_DOWN_VARIANT, [
        "!2, !3",
      ]);
      const identityMap = getRankMap(
        new Set([1, 4, 5, 7]),
        UP_OR_DOWN_VARIANT.suits.length,
      );
      expect(
        identityArrayToMap(possibilities, UP_OR_DOWN_VARIANT.suits.length),
      ).toEqual(identityMap);
    });

    test("negative conjunct with space", () => {
      const possibilities = getPossibilitiesFromKeywords(DEFAULT_VARIANT, [
        "! 2, ! 3",
      ]);
      const identityMap = getRankMap(
        new Set([1, 4, 5]),
        UP_OR_DOWN_VARIANT.suits.length,
      );
      expect(
        identityArrayToMap(possibilities, UP_OR_DOWN_VARIANT.suits.length),
      ).toEqual(identityMap);
    });

    // The note keyword `r,b,2,3` would return all red, blue, 2's OR 3's.
    test("positive suit and rank", () => {
      const possibilities = getPossibilitiesFromKeywords(DEFAULT_VARIANT, [
        "r,3,b,2",
      ]);
      expect(possibilities).toEqual([
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
      ]);
    });

    test("positive suit and rank with Up or Down", () => {
      const possibilities = getPossibilitiesFromKeywords(UP_OR_DOWN_VARIANT, [
        "r,3,b,2",
      ]);
      expect(possibilities).toEqual([
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

    // The note keyword `r3b2` would return all red cards, 3's, blue cards, or 2's. (A player would
    // probably conventionally write this as `rb23`, but we test for the more complicated case.)
    test("positive squish", () => {
      const possibilities = getPossibilitiesFromKeywords(DEFAULT_VARIANT, [
        "r3b2",
      ]);
      expect(possibilities).toEqual([
        [0, 2],
        [3, 2],
        [0, 3],
        [3, 3],
      ]);
    });

    test("positive squish in Up or Down", () => {
      const possibilities = getPossibilitiesFromKeywords(UP_OR_DOWN_VARIANT, [
        "r3b2",
      ]);
      expect(possibilities).toEqual([
        [0, 2],
        [3, 2],
        [0, 3],
        [3, 3],
      ]);
    });

    // The note keyword `r,!2,!3` would return `[[0,1], [0,4], [0,5]`.
    test("positive and negative", () => {
      const possibilities = getPossibilitiesFromKeywords(DEFAULT_VARIANT, [
        "r,!2,!3",
      ]);
      expect(possibilities).toEqual([
        [0, 1],
        [0, 4],
        [0, 5],
      ]);
    });

    test("positive and negative in Up or Down", () => {
      const possibilities = getPossibilitiesFromKeywords(UP_OR_DOWN_VARIANT, [
        "r,!2,!3",
      ]);
      expect(possibilities).toEqual([
        [0, 1],
        [0, 4],
        [0, 5],
        [0, 7],
      ]);
    });
  });
});

function getRankMap(
  ranks: ReadonlySet<number>,
  numSuits: number,
): ReadonlyArray<readonly number[]> {
  const cardMap: number[][] = [];

  for (const rank of [1, 2, 3, 4, 5, 6, 7]) {
    if (ranks.has(rank)) {
      cardMap.push(ONES.slice(0, numSuits));
    } else {
      cardMap.push(ZEROES.slice(0, numSuits));
    }
  }

  return cardMap;
}

function identityArrayToMap(
  possibilities: readonly SuitRankTuple[],
  numSuits: number,
): ReadonlyArray<readonly number[]> {
  const cardMap: number[][] = [];

  for (const _rank of iRange(1, 7)) {
    cardMap.push(ZEROES.slice(0, numSuits));
  }

  for (const [suitIndex, rank] of possibilities) {
    cardMap[rank - 1]![suitIndex] = 1;
  }

  return cardMap;
}
