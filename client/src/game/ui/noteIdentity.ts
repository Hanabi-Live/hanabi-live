import { parseIntSafe } from "../../misc";
import * as modals from "../../modals";
import { canPossiblyBe } from "../rules/card";
import CardIdentity from "../types/CardIdentity";
import CardNote from "../types/CardNote";
import CardState from "../types/CardState";
import { STACK_BASE_RANK, START_CARD_RANK } from "../types/constants";
import Variant from "../types/Variant";
import globals from "./globals";
import { extractRankText, extractSuitText } from "./noteIdentityPattern";

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
        possibilities.findIndex(
          (possibility) =>
            possibility[0] === identity.suitIndex &&
            possibility[1] === identity.rank,
        ) === -1
      ) {
        possibilities.push([identity.suitIndex, identity.rank]);
      }
    } else if (identity.suitIndex !== null && identity.rank === null) {
      // Encountered a suit item, expand to all cards of that suit
      for (const rank of variant.ranks) {
        // Check that this identity is not already present in the list
        if (
          possibilities.findIndex(
            (possibility) =>
              possibility[0] === identity.suitIndex && possibility[1] === rank,
          ) === -1
        ) {
          possibilities.push([identity.suitIndex, rank]);
        }
      }
    } else if (identity.suitIndex === null && identity.rank !== null) {
      // Encountered a rank item, expand to all cards of that rank
      for (let suitIndex = 0; suitIndex < variant.suits.length; suitIndex++) {
        // Check that this identity is not already present in the list
        if (
          possibilities.findIndex(
            (possibility) =>
              possibility[0] === suitIndex && possibility[1] === identity.rank,
          ) === -1
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
    const intersection = newPossibilities.filter(
      ([newSuitIndex, newRank]) =>
        oldPossibilities.findIndex(
          ([oldSuitIndex, oldRank]) =>
            newSuitIndex === oldSuitIndex && newRank === oldRank,
        ) !== -1,
    );
    // If this new term completely conflicts with the previous terms, then reset our state to
    // just the new term
    possibilities = intersection.length === 0 ? newPossibilities : intersection;
  }

  return possibilities;
}

export function checkNoteImpossibility(
  variant: Variant,
  cardState: CardState,
  note: CardNote,
): void {
  const { possibilities } = note;
  if (possibilities.length === 0) {
    return;
  }
  // Prevent players from accidentally mixing up which stack base is which
  if (
    cardState.rank === STACK_BASE_RANK &&
    possibilities.every((possibility) => possibility[0] !== cardState.suitIndex)
  ) {
    modals.warningShow(
      "You cannot morph a stack base to have a different suit.",
    );
    note.possibilities = [];
    return;
  }

  // Only validate cards in our own hand
  if (
    !(cardState.location === globals.metadata.ourPlayerIndex) ||
    possibilities.some((possibility) =>
      canPossiblyBe(cardState, possibility[0], possibility[1]),
    )
  ) {
    return;
  }

  // We have specified a list of identities where none are possible
  const impossibilities = Array.from(possibilities, ([suitIndex, rank]) => {
    const suitName = variant.suits[suitIndex].displayName;
    const impossibleSuit = suitName.toLowerCase();
    const impossibleRank = rank === START_CARD_RANK ? "START" : rank.toString();
    return `${impossibleSuit} ${impossibleRank}`;
  });
  if (impossibilities.length === 1) {
    modals.warningShow(`That card cannot possibly be ${impossibilities[0]}`);
  } else {
    modals.warningShow(
      `That card cannot possibly be any of ${impossibilities.join(", ")}`,
    );
  }
  note.possibilities = [];
}
