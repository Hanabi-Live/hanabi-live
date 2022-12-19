import {
  ALL_RESERVED_NOTES,
  MAX_RANK,
  parseIntSafe,
  START_CARD_RANK,
  Variant,
} from "@hanabi/data";
import CardIdentity from "../types/CardIdentity";
import { CardIdentityType } from "../types/CardIdentityType";

interface CardIdentities {
  readonly suitIndices: number[];
  readonly ranks: number[];
}

function parseSuit(variant: Variant, suitText: string): number | null {
  const suitAbbreviationIndex = variant.suitAbbreviations.findIndex(
    (abbreviation) => abbreviation.toLowerCase() === suitText,
  );
  if (suitAbbreviationIndex !== -1) {
    return suitAbbreviationIndex;
  }

  const suitNameIndex = variant.suits.findIndex(
    (suit) => suit.displayName.toLowerCase() === suitText,
  );
  if (suitNameIndex !== -1) {
    return suitNameIndex;
  }

  return null;
}

function parseRank(rankText: string): number {
  const rank = parseIntSafe(rankText);
  if (rank === 0 || Number.isNaN(rank)) {
    return START_CARD_RANK;
  }

  return rank;
}

/**
 * Parse a string into a CardIdentity.
 *
 * @param variant The game variant.
 * @param keyword The string to be parsed.
 * @returns Return {suitIndex, rank}.
 */
export function parseIdentity(variant: Variant, keyword: string): CardIdentity {
  if (keyword.toLowerCase() === "blank") {
    // Create a blank morph.
    return { suitIndex: null, rank: null };
  }
  if (keyword.length === 0) {
    // Return morph to original.
    return {
      suitIndex: CardIdentityType.Original,
      rank: CardIdentityType.Original,
    };
  }

  const identityMatch = new RegExp(
    variant.identityNotePattern.toLowerCase(),
  ).exec(keyword.toLowerCase());

  if (identityMatch !== null) {
    const suitText = extractSuitText(identityMatch);
    const rankText = extractRankText(identityMatch);
    if (suitText !== null && rankText !== null) {
      return {
        suitIndex: parseSuit(variant, suitText),
        rank: parseRank(rankText),
      };
    }
  }

  return { suitIndex: CardIdentityType.Fail, rank: CardIdentityType.Fail };
}

function parseIdentities(variant: Variant, keyword: string): CardIdentities {
  const identityMatch = new RegExp(variant.identityNotePattern).exec(keyword);
  let suitIndex: number | null = null;
  let rank: number | null = null;
  if (identityMatch !== null) {
    const squishText = extractSquishText(identityMatch);
    const suitIndices: number[] = [];
    const ranks: number[] = [];
    if (squishText !== null) {
      [].map.call(squishText, (letter) => {
        suitIndex = parseSuit(variant, letter);
        rank = parseRank(letter);
        if (suitIndex !== null) {
          suitIndices.push(suitIndex);
          // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition
        } else if (rank !== null) {
          ranks.push(rank);
        }
      });
      if (suitIndices.length + ranks.length > 0) {
        return { suitIndices, ranks };
      }
    }
    const suitText = extractSuitText(identityMatch);
    if (suitText !== null) {
      suitIndex = parseSuit(variant, suitText);
    }
    const rankText = extractRankText(identityMatch);
    if (rankText !== null) {
      rank = parseRank(rankText);
    }
  }

  return {
    suitIndices: suitIndex === null ? [] : [suitIndex],
    ranks: rank === null ? [] : [rank],
  };
}

function range(
  _start: number,
  _stop: number | null = null,
  step = 1,
): number[] {
  const start: number = _stop === null ? 0 : _start;
  const stop: number = _stop === null ? _start : _stop;

  const numbersInRange: number[] = [];
  for (let i = start; i < stop; i += step) {
    numbersInRange.push(i);
  }

  return numbersInRange;
}

function identityMapToArray(cardMap: number[][]) {
  const possibilities: Array<[number, number]> = [];
  for (let rank = 1; rank <= cardMap.length; rank++) {
    for (let suitIndex = 0; suitIndex < cardMap[0]!.length; suitIndex++) {
      // eslint-disable-next-line @typescript-eslint/strict-boolean-expressions
      if (cardMap[rank - 1]![suitIndex]) {
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
  keywordPreTrim: string,
): Array<[number, number]> | null {
  const positiveIdentities: CardIdentities[] = []; // Any combination of suits and ranks
  const negativeIdentities: CardIdentities[] = []; // Any negative cluing `!r1` `!3`
  for (const substring of keywordPreTrim.split(",")) {
    const trimmed = substring.trim();
    const negative = trimmed.startsWith("!");
    const identity = parseIdentities(
      variant,
      (negative ? trimmed.substring(1) : trimmed).trim(),
    );
    if (negative) {
      negativeIdentities.push(identity);
    } else {
      positiveIdentities.push(identity);
    }
  }

  // Start with all 1's if no positive info, else all 0's.
  const identityMap: number[][] = [];
  const positiveRanks = new Set(
    positiveIdentities.length > 0 ? [] : variant.ranks,
  );
  for (let rank = 1; rank <= MAX_RANK; rank++) {
    identityMap.push(
      // eslint-disable-next-line @typescript-eslint/no-unsafe-argument
      Array(variant.suits.length).fill(positiveRanks.has(rank) ? 1 : 0),
    );
  }

  // Then add positive items and remove all negatives.
  for (const identities of [positiveIdentities, negativeIdentities]) {
    const negative = identities === negativeIdentities;
    for (const identity of identities) {
      const ranks = identity.ranks.length > 0 ? identity.ranks : variant.ranks;
      for (const rank of ranks) {
        const suitIndices =
          identity.suitIndices.length > 0
            ? identity.suitIndices
            : range(variant.suits.length);
        for (const suitIndex of suitIndices) {
          identityMap[rank - 1]![suitIndex] = negative ? 0 : 1;
        }
      }
    }
  }

  return identityMapToArray(identityMap);
}

// Examines a whole note and for each keyword that declares card possibilities, merges them into one
// list.
export function getPossibilitiesFromKeywords(
  variant: Variant,
  keywords: string[],
): Array<[number, number]> {
  let possibilities: Array<[number, number]> = [];

  // Empty keyword list returns all possibilities.
  for (const keyword of keywords.length > 0 ? keywords : [""]) {
    const newPossibilities = getPossibilitiesFromKeyword(variant, keyword);
    if (newPossibilities === null) {
      continue;
    }

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

const extractSuitText = (match: RegExpMatchArray) =>
  match[1] ?? match[4] ?? match[5] ?? null;

const extractRankText = (match: RegExpMatchArray) =>
  match[2] ?? match[3] ?? match[6] ?? null;

const extractSquishText = (match: RegExpMatchArray) => {
  const text = match[7]?.trim();

  if (text !== undefined && !ALL_RESERVED_NOTES.includes(text)) {
    return text;
  }

  return null;
};
