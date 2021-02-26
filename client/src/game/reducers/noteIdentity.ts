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

function possibilitiesComplement(
  variant: Variant,
  possibilities: Array<[number, number]>,
): Array<[number, number]> {
  const complement: Array<[number, number]> = [];
  for (let suitIndex = 0; suitIndex < variant.suits.length; suitIndex++) {
    for (const rank of variant.ranks) {
      // Ensure that this possibility is not present in the source list
      if (
        !possibilities.some(
          ([negatedSuitIndex, negatedRank]) =>
            negatedSuitIndex === suitIndex && negatedRank === rank,
        )
      ) {
        complement.push([suitIndex, rank]);
      }
    }
  }

  return complement;
}

function identityMapToArray(
  cardMap: Array<Array<number>>,
): Array<[number, number]> {
  const rows = cardMap.length;
  const cols = cardMap[0].length;
  const possibilities: Array<[number, number]> = [];
  for (let row = 0; row < rows; ++row) {
    for (let col = 0; col < cols; ++col) {
      if (cardMap[row][col]) {
        possibilities.push([col, row + 1]);
      }
    }
  }
  return possibilities;
}

/*
function identityArrayToMap(
  possibilities: Array<[number, number]>,
): Array<Array<number>> {
  const zeros = [0, 0, 0, 0, 0, 0];
  let identityMap = [zeros.slice(), zeros.slice(), zeros.slice(), zeros.slice(), zeros.slice()];
  for (const card of possibilities) {
    identityMap[card[1] - 1][card[0]] = 1;
  }
  return identityMap;
}
*/

// Examines a single square bracket-enclosed part of a note (i.e. keyword) and returns the set of
// card possibilities that it declares
//
// e.g. the note keyword `red` would return `[[0,1], [0,2], [0,3], [0,4], [0,5]]`
// and the note keyword `red 3, blue 3` would return `[[0,3], [1,3]]`
// and the note keyword `r,b,2,3, blue 3` would return `[[0,2], [1,2], [0,3], [1,3]]`
// and the note keyword `r,!2,!3` would return `[[0,1], [0,4], [0,5]`
function getPossibilitiesFromKeyword_(
  variant: Variant,
  keywordPreTrim: string,
): Array<[number, number]> | null {
  const positiveIdent = [], negativeIdent = [];
  let positiveRanks = new Set() as Set<number>, positiveSuits = new Set() as Set<number>;
  for (const substring of keywordPreTrim.split(",")) {
    const trimmed = substring.trim();
    const negative = trimmed.startsWith("!");
    const identity = parseIdentity(variant, (negative ? trimmed.substring(1) : trimmed).trim());
    if (negative) {
      negativeIdent.push(identity);
    } else if (identity.rank === null) {
      if (identity.suitIndex === null) {
        return null;
      }
      positiveSuits.add(identity.suitIndex);
    } else if (identity.suitIndex === null) {
      positiveRanks.add(identity.rank);
    } else {
      positiveIdent.push(identity);
    }
  }
  // Start with the cross of the positive ranks and suits.
  const hasSuits = positiveSuits.size > 0;
  positiveSuits = positiveSuits.size ? positiveSuits : new Set([0, 1, 2, 3, 4, 5]);
  positiveRanks = (!hasSuits || positiveRanks.size) ? positiveRanks : new Set([1, 2, 3, 4, 5]);
  const zeros = [0, 0, 0, 0, 0, 0];
  const positiveSuitsTemplate = zeros.slice();
  positiveSuits.forEach((suit) => {
    positiveSuitsTemplate[suit] = 1;
  });
  let identityMap = [];
  for (let rank = 1; rank <= 5; ++rank ) {
    identityMap.push(positiveRanks.has(rank) ? positiveSuitsTemplate.slice() : zeros.slice());
  }
  // Then add individual items and remove all negatives.
  for (const identities of [positiveIdent, negativeIdent]) {
    const negative = (identities === negativeIdent);
    for (const identity of identities) {
      for (let rank = 1; rank <= 5; ++rank) {
        if (identity.rank !== null && identity.rank !== rank) {
          continue;
        }
        for (let suitIndex = 0; suitIndex < variant.suits.length; ++suitIndex) {
          if (identity.suitIndex !== null && identity.suitIndex !== suitIndex) {
            continue;
          }
          identityMap[rank - 1][suitIndex] = negative ? 0 : 1;
        }
      }
    }
  }
  return identityMapToArray(identityMap);
}

// Examines a single square bracket-enclosed part of a note (i.e. keyword) and returns the set of
// card possibilities that it declares
//
// e.g. the note keyword `red` would return `[[0,1], [0,2], [0,3], [0,4], [0,5]]`
// and the note keyword `red 3, blue 3` would return `[[0,3], [1,3]]`
function getPossibilitiesFromKeyword(
  variant: Variant,
  keywordPreTrim: string,
): Array<[number, number]> | null {
  if (1) {
    return getPossibilitiesFromKeyword_(variant, keywordPreTrim);
  }
  const possibilities: Array<[number, number]> = [];
  const negative = keywordPreTrim.startsWith("!");
  const keyword = negative ? keywordPreTrim.substring(1) : keywordPreTrim;
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

  if (negative) {
    return possibilitiesComplement(variant, possibilities);
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
  // debugger;
  const suitPattern = createSuitPattern(suits, abbreviations);
  const rankPattern = createRankPattern(ranks, isUpOrDown);
  return `^(?:${suitPattern} ?${rankPattern}|${rankPattern} ?${suitPattern}|${suitPattern}|${rankPattern})$`;
}

export const extractSuitText = (match: RegExpMatchArray): string | null =>
  match[1] ?? match[4] ?? match[5] ?? null;

export const extractRankText = (match: RegExpMatchArray): string | null =>
  match[2] ?? match[3] ?? match[6] ?? null;
