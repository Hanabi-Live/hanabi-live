import { parseIntSafe } from "../../misc";
import CardIdentity from "../types/CardIdentity";
import { START_CARD_RANK } from "../types/constants";
import Suit from "../types/Suit";
import Variant from "../types/Variant";

function parseSuit(variant: Variant, suitText: string): number | null {
  const suitAbbreviationIndex = variant.abbreviations.findIndex(
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

export function parseIdentity(variant: Variant, keyword: string): CardIdentity {
  const identityMatch = new RegExp(variant.identityNotePattern).exec(keyword);
  let suitIndex = null;
  let rank = null;
  if (identityMatch !== null) {
    const suitText = extractSuitText(identityMatch);
    if (suitText !== null) {
      suitIndex = parseSuit(variant, suitText);
    }
    const rankText = extractRankText(identityMatch);
    if (rankText !== null) {
      rank = parseRank(rankText);
    }
  }

  return { suitIndex, rank };
}

// Examines a single square bracket-enclosed part of a note (i.e. keyword) and returns the set of
// card possibilities that it declares
//
// e.g. the note keyword `red` would return `[[0,1], [0,2], [0,3], [0,4], [0,5]]`
// and the note keyword `red 3, blue 3` would return `[[0,3], [1,3]]`
function getPossibilitiesFromKeyword(
  variant: Variant,
  keyword: string,
): Array<[number, number]> | null {
  const possibilities: Array<[number, number]> = [];
  for (const substring of keyword.split(",")) {
    const identity = parseIdentity(variant, substring.trim());
    if (identity.suitIndex !== null && identity.rank !== null) {
      // Encountered an identity item, add it

      // Check that this identity is not already present in the list
      if (
        !possibilities.some(
          (possibility) =>
            possibility[0] === identity.suitIndex &&
            possibility[1] === identity.rank,
        )
      ) {
        possibilities.push([identity.suitIndex, identity.rank]);
      }
    } else if (identity.suitIndex !== null && identity.rank === null) {
      // Encountered a suit item, expand to all cards of that suit
      for (const rank of variant.ranks) {
        // Check that this identity is not already present in the list
        if (
          !possibilities.some(
            (possibility) =>
              possibility[0] === identity.suitIndex && possibility[1] === rank,
          )
        ) {
          possibilities.push([identity.suitIndex, rank]);
        }
      }
    } else if (identity.suitIndex === null && identity.rank !== null) {
      // Encountered a rank item, expand to all cards of that rank
      for (let suitIndex = 0; suitIndex < variant.suits.length; suitIndex++) {
        // Check that this identity is not already present in the list
        if (
          !possibilities.some(
            (possibility) =>
              possibility[0] === suitIndex && possibility[1] === identity.rank,
          )
        ) {
          possibilities.push([suitIndex, identity.rank]);
        }
      }
    } else {
      // Encountered invalid identity; do not parse keyword as an identity list
      return null;
    }
  }

  return possibilities;
}

// Examines a whole note and for each keyword that declares card possibilities, merges them into one list.
export function getPossibilitiesFromKeywords(
  variant: Variant,
  keywords: string[],
): Array<[number, number]> {
  let possibilities: Array<[number, number]> = [];

  for (const keyword of keywords) {
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
    // If this new term completely conflicts with the previous terms, then reset our state to
    // just the new term
    possibilities = intersection.length === 0 ? newPossibilities : intersection;
  }

  return possibilities;
}

function createSuitPattern(suits: Suit[], abbreviations: string[]): string {
  let alternation = "";
  suits.forEach((suit, i) => {
    if (i !== 0) {
      alternation += "|";
    }

    alternation += abbreviations[i].toLowerCase();
    alternation += "|";
    alternation += suit.displayName.toLowerCase();
  });

  return `(${alternation})`;
}

function createRankPattern(ranks: number[], isUpOrDown: boolean): string {
  let rankStrings = ranks.map((r) => r.toString());
  if (isUpOrDown) {
    rankStrings = rankStrings.concat("0", "s", "start");
  }

  return `(${rankStrings.join("|")})`;
}

export function createIdentityNotePattern(
  suits: Suit[],
  ranks: number[],
  abbreviations: string[],
  isUpOrDown: boolean,
): string {
  const suitPattern = createSuitPattern(suits, abbreviations);
  const rankPattern = createRankPattern(ranks, isUpOrDown);
  return `^(?:${suitPattern} ?${rankPattern}|${rankPattern} ?${suitPattern}|${suitPattern}|${rankPattern})$`;
}

export const extractSuitText = (match: RegExpMatchArray): string | null =>
  match[1] ?? match[4] ?? match[5] ?? null;

export const extractRankText = (match: RegExpMatchArray): string | null =>
  match[2] ?? match[3] ?? match[6] ?? null;
