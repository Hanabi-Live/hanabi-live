import { parseIntSafe } from "../../misc";
import CardIdentity from "../types/CardIdentity";
import { MAX_RANK, START_CARD_RANK } from "../types/constants";
import Suit from "../types/Suit";
import Variant from "../types/Variant";
import { ALL_RESERVED_NOTES } from "./constants";

interface CardIdentities {
  readonly suitIndices: number[];
  readonly ranks: number[];
}

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

function parseIdentities(variant: Variant, keyword: string): CardIdentities {
  const identityMatch = new RegExp(variant.identityNotePattern).exec(keyword);
  let suitIndex = null;
  let rank = null;
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
  const ret: number[] = [];
  for (let i = start; i < stop; i += step) {
    ret.push(i);
  }
  return ret;
}

export function identityMapToArray(
  cardMap: number[][],
): Array<[number, number]> {
  const possibilities: Array<[number, number]> = [];
  for (let rank = 1; rank <= cardMap.length; rank++) {
    for (let suitIndex = 0; suitIndex < cardMap[0].length; suitIndex++) {
      if (cardMap[rank - 1][suitIndex]) {
        possibilities.push([suitIndex, rank]);
      }
    }
  }
  return possibilities;
}

// Examines a single square bracket-enclosed part of a note (i.e. keyword) and returns the set of
// card possibilities that it declares
//
// e.g. the note keyword `red` would return `[[0,1], [0,2], [0,3], [0,4], [0,5]]`
// and the note keyword `red 3, blue 3` would return `[[0,3], [3,3]]`
// and the note keyword `rb23` would return `[[0,2], [3,2], [0,3], [3,3]]`
// and the note keyword `r,b,2,3` would return all reds, blues, 2's, and 3's
// and the note keyword `r,!2,!3` would return `[[0,1], [0,4], [0,5]`
function getPossibilitiesFromKeyword(
  variant: Variant,
  keywordPreTrim: string,
): Array<[number, number]> | null {
  const positiveIdent = []; // Any combination of suits and ranks
  const negativeIdent = []; // Any negative cluing `!r1` `!3`
  for (const substring of keywordPreTrim.split(",")) {
    const trimmed = substring.trim();
    const negative = trimmed.startsWith("!");
    const identity = parseIdentities(
      variant,
      (negative ? trimmed.substring(1) : trimmed).trim(),
    );
    if (negative) {
      negativeIdent.push(identity);
    } else {
      positiveIdent.push(identity);
    }
  }
  // Start with all 1's if no positive info, else all 0's
  const identityMap = [];
  const positiveRanks = new Set(positiveIdent.length > 0 ? [] : variant.ranks);
  for (let rank = 1; rank <= MAX_RANK; rank++) {
    identityMap.push(
      Array(variant.suits.length).fill(positiveRanks.has(rank) ? 1 : 0),
    );
  }
  // Then add positive items and remove all negatives
  for (const identities of [positiveIdent, negativeIdent]) {
    const negative = identities === negativeIdent;
    for (const identity of identities) {
      const ranks = identity.ranks.length ? identity.ranks : variant.ranks;
      for (const rank of ranks) {
        const suitIndices = identity.suitIndices.length
          ? identity.suitIndices
          : range(variant.suits.length);
        for (const suitIndex of suitIndices) {
          identityMap[rank - 1][suitIndex] = negative ? 0 : 1;
        }
      }
    }
  }
  return identityMapToArray(identityMap);
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

function createSquishPattern(
  abbreviations: string[],
  ranks: number[],
  isUpOrDown: boolean,
): string {
  let rankStrings = ranks.map((r) => r.toString());
  if (isUpOrDown) {
    rankStrings = rankStrings.concat("0", "s");
  }
  const allNoteLetters = rankStrings.concat(abbreviations);
  return `([${allNoteLetters.join("").toLowerCase()}]+)`;
}

export function createIdentityNotePattern(
  suits: Suit[],
  ranks: number[],
  abbreviations: string[],
  isUpOrDown: boolean,
): string {
  const suitPattern = createSuitPattern(suits, abbreviations);
  const rankPattern = createRankPattern(ranks, isUpOrDown);
  const squishPattern = createSquishPattern(abbreviations, ranks, isUpOrDown);
  return `^(?:${suitPattern} ?${rankPattern}|${rankPattern} ?${suitPattern}|${suitPattern}|${rankPattern}|${squishPattern})$`;
}

export const extractSuitText = (match: RegExpMatchArray): string | null =>
  match[1] ?? match[4] ?? match[5] ?? null;

export const extractRankText = (match: RegExpMatchArray): string | null =>
  match[2] ?? match[3] ?? match[6] ?? null;

export const extractSquishText = (match: RegExpMatchArray): string | null => {
  const text = match[7]?.trim();
  if (ALL_RESERVED_NOTES.indexOf(text) === -1) {
    return text ?? null;
  }
  return null;
};
