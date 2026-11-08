import type {
  CardIdentity,
  Rank,
  SuitIndex,
  SuitRankTuple,
  Variant,
} from "@hanabi-live/game";
import {
  ALL_RESERVED_NOTES,
  DEFAULT_CARD_RANKS,
  RANK_GROUP_NAMES,
  SQUISH_GROUP_NAME,
  START_CARD_RANK,
  SUIT_GROUP_NAMES,
} from "@hanabi-live/game";
import { eRange, newArray } from "complete-common";
import { START_CARD_RANK_LABEL } from "../../constants";

/**
 * Represents the card identities that a card could possibly be.
 *
 * For example, in a "No Variant" game:
 *
 * ```ts
 * {
 *   suitIndices: [0, 1],
 *   ranks: [1],
 * }
 * ```
 *
 * This means that the card can possibly be a red 1 or a yellow 1.
 */
interface CardIdentities {
  readonly suitIndices: SuitIndex[];
  readonly ranks: Rank[];
}

function parseSuit(variant: Variant, suitText: string): SuitIndex | null {
  const suitAbbreviationIndex = variant.suitAbbreviations.findIndex(
    (abbreviation) => abbreviation.toLowerCase() === suitText,
  );
  if (suitAbbreviationIndex !== -1) {
    return suitAbbreviationIndex as SuitIndex;
  }

  const suitNameIndex = variant.suits.findIndex(
    (suit) => suit.displayName.toLowerCase() === suitText,
  );
  if (suitNameIndex !== -1) {
    return suitNameIndex as SuitIndex;
  }

  return null;
}

function parseRank(rankText: string): Rank | null {
  switch (rankText) {
    case "0":
    case START_CARD_RANK_LABEL.toLowerCase():
    case START_CARD_RANK_LABEL: {
      return START_CARD_RANK;
    }

    default: {
      return (
        DEFAULT_CARD_RANKS.find((rank) => rank.toString() === rankText) ?? null
      );
    }
  }
}

const identityPatterns = new Map<string, RegExp>();

/** Variant identity patterns are large, so compile each one once. */
function identityPattern(pattern: string): RegExp {
  let regExp = identityPatterns.get(pattern);
  if (regExp === undefined) {
    regExp = new RegExp(pattern);
    identityPatterns.set(pattern, regExp);
  }
  return regExp;
}

/**
 * Parse a string into a `CardIdentity`.
 *
 * @param variant The game variant.
 * @param keyword The string to be parsed.
 * @returns Return {suitIndex, rank}.
 */
export function parseIdentity(
  variant: Variant,
  keyword: string,
): CardIdentity | "original" | undefined {
  if (keyword.toLowerCase() === "blank") {
    // Create a blank morph.
    return {
      suitIndex: null,
      rank: null,
    };
  }

  if (keyword === "") {
    // Return morph to original.
    return "original";
  }

  const identityMatch = identityPattern(
    variant.identityNotePattern.toLowerCase(),
  ).exec(keyword.toLowerCase());

  if (identityMatch !== null) {
    const suitText = extractSuitText(identityMatch);
    const rankText = extractRankText(identityMatch);
    if (suitText !== undefined && rankText !== undefined) {
      return {
        suitIndex: parseSuit(variant, suitText),
        rank: parseRank(rankText),
      };
    }
  }

  return undefined;
}

function parseIdentities(variant: Variant, keyword: string): CardIdentities {
  const identityMatch = identityPattern(variant.identityNotePattern).exec(
    keyword,
  );
  let suitIndex: SuitIndex | null = null;
  let rank: Rank | null = null;
  if (identityMatch !== null) {
    const squishText = extractSquishText(identityMatch);
    const suitIndices: SuitIndex[] = [];
    const ranks: Rank[] = [];
    if (squishText !== undefined) {
      for (const letter of squishText) {
        suitIndex = parseSuit(variant, letter);
        rank = parseRank(letter);
        if (suitIndex !== null) {
          suitIndices.push(suitIndex);
        } else if (rank !== null) {
          ranks.push(rank);
        }
      }

      if (suitIndices.length + ranks.length > 0) {
        return { suitIndices, ranks };
      }
    }
    const suitText = extractSuitText(identityMatch);
    if (suitText !== undefined) {
      suitIndex = parseSuit(variant, suitText);
    }
    const rankText = extractRankText(identityMatch);
    if (rankText !== undefined) {
      rank = parseRank(rankText);
    }
  }

  return {
    suitIndices: suitIndex === null ? [] : [suitIndex],
    ranks: rank === null ? [] : [rank],
  };
}

function identityMapToArray(
  variant: Variant,
  identityMap: ReadonlyArray<readonly boolean[]>,
): readonly SuitRankTuple[] {
  const possibilities: SuitRankTuple[] = [];

  for (const rank of variant.ranks) {
    const suitArray = identityMap[rank];
    if (suitArray === undefined) {
      continue;
    }

    for (const [i, isRankSuitCombinationPossible] of suitArray.entries()) {
      const suitIndex = i as SuitIndex;
      if (isRankSuitCombinationPossible) {
        possibilities.push([suitIndex, rank]);
      }
    }
  }

  return possibilities;
}

/**
 * Examines a single square bracket-enclosed part of a note (i.e. keyword) and returns the set of
 * card possibilities that it declares.
 *
 * Examples:
 * - `red` --> `[[0,1], [0,2], [0,3], [0,4], [0,5]]`
 * - `red 3, blue 3` --> `[[0,3], [3,3]]`
 * - `rb23` --> `[[0,2], [3,2], [0,3], [3,3]]`
 * - `r,b,2,3` --> all reds, blues, 2's, and 3's
 * - `r,!2,!3` --> `[[0,1], [0,4], [0,5]`
 */
function getPossibilitiesFromKeyword(
  variant: Variant,
  keyword: string,
): readonly SuitRankTuple[] {
  const { positiveCardIdentities, negativeCardIdentities } =
    getCardIdentitiesFromKeyword(variant, keyword);

  /**
   * The first index is the rank, the second index is the suit. (Unlike a standard array, there
   * should not be an element at the 0th index, because there is no 0th rank.)
   */
  const identityMap: boolean[][] = [];

  const positiveRanks = new Set(
    positiveCardIdentities.length > 0 ? [] : variant.ranks,
  );

  // Fill the identity map with an array for each rank.
  for (const rank of variant.ranks) {
    const identityArrayValue = positiveRanks.has(rank);
    const identityArray = newArray(variant.suits.length, identityArrayValue);
    identityMap[rank] = identityArray as boolean[];
  }

  // Add positive items and remove negatives items.
  for (const cardIdentitiesArray of [
    positiveCardIdentities,
    negativeCardIdentities,
  ]) {
    const isPositive = cardIdentitiesArray === positiveCardIdentities;
    for (const cardIdentities of cardIdentitiesArray) {
      const ranks =
        cardIdentities.ranks.length > 0 ? cardIdentities.ranks : variant.ranks;
      const suitIndices =
        cardIdentities.suitIndices.length > 0
          ? cardIdentities.suitIndices
          : [...eRange(variant.suits.length)];

      for (const rank of ranks) {
        for (const suitIndex of suitIndices) {
          identityMap[rank]![suitIndex] = isPositive;
        }
      }
    }
  }

  return identityMapToArray(variant, identityMap);
}

function getCardIdentitiesFromKeyword(variant: Variant, keyword: string) {
  const positiveCardIdentities: CardIdentities[] = []; // Any combination of suits and ranks
  const negativeCardIdentities: CardIdentities[] = []; // Any negative cluing, e.g. `!r1` `!3`

  for (const keywordSegmentRaw of keyword.split(",")) {
    const keywordSegment = keywordSegmentRaw.trim();
    const isNegative = keywordSegment.startsWith("!");
    const keywordSegmentWithoutExclamationPoint = isNegative
      ? keywordSegment.slice(1).trim()
      : keywordSegment;
    const cardIdentities = parseIdentities(
      variant,
      keywordSegmentWithoutExclamationPoint,
    );
    if (isNegative) {
      negativeCardIdentities.push(cardIdentities);
    } else {
      positiveCardIdentities.push(cardIdentities);
    }
  }

  return {
    positiveCardIdentities,
    negativeCardIdentities,
  };
}

/**
 * Examines a whole note and for each keyword that declares card possibilities, merges them into one
 * list.
 */
export function getPossibilitiesFromKeywords(
  variant: Variant,
  keywords: readonly string[],
): readonly SuitRankTuple[] {
  let possibilities: readonly SuitRankTuple[] = [];

  // Empty keyword list returns all possibilities.
  for (const keyword of keywords.length > 0 ? keywords : [""]) {
    if (keyword === "!") {
      continue;
    }
    const newPossibilities = getPossibilitiesFromKeyword(variant, keyword);
    const oldPossibilities = possibilities;
    const intersection = newPossibilities.filter(([newSuitIndex, newRank]) =>
      oldPossibilities.some(
        ([oldSuitIndex, oldRank]) =>
          newSuitIndex === oldSuitIndex && newRank === oldRank,
      ),
    );

    // If this new term completely conflicts with the previous terms, then reset our state to just
    // the new term.
    possibilities = intersection.length === 0 ? newPossibilities : intersection;
  }

  return possibilities;
}

function extractSuitText(match: RegExpMatchArray): string | undefined {
  return firstGroup(match, SUIT_GROUP_NAMES);
}

function extractRankText(match: RegExpMatchArray): string | undefined {
  return firstGroup(match, RANK_GROUP_NAMES);
}

/** Only one alternative of an identity note pattern matches, so at most one group is defined. */
function firstGroup(
  match: RegExpMatchArray,
  groupNames: readonly string[],
): string | undefined {
  for (const groupName of groupNames) {
    const text = match.groups?.[groupName];
    if (text !== undefined) {
      return text;
    }
  }

  return undefined;
}

function extractSquishText(match: RegExpMatchArray): string | undefined {
  const text = match.groups?.[SQUISH_GROUP_NAME]?.trim();

  if (text !== undefined && !ALL_RESERVED_NOTES.has(text.toLowerCase())) {
    return text;
  }

  return undefined;
}
