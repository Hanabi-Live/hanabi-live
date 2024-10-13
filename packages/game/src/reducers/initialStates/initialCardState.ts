/* eslint-disable unicorn/no-null */

import { newArray } from "complete-common";
import type { CardState } from "../../interfaces/CardState";
import type { Variant } from "../../interfaces/Variant";
import { getTotalCardsInDeck } from "../../rules/deck";
import type { CardOrder } from "../../types/CardOrder";
import type { NumPlayers } from "../../types/NumPlayers";
import type { SuitIndex } from "../../types/SuitIndex";
import type { SuitRankTuple } from "../../types/SuitRankTuple";

export function getInitialCardState(
  order: CardOrder,
  variant: Variant,
  numPlayers: NumPlayers,
): CardState {
  // Possible suits and ranks (based on clues given) are tracked separately from knowledge of the
  // true suit and rank.
  const possibleCards: SuitRankTuple[] = [];
  for (const i of variant.suits.keys()) {
    const suitIndex = i as SuitIndex;
    for (const rank of variant.ranks) {
      possibleCards.push([suitIndex, rank]);
    }
  }

  const totalCardsInDeck = getTotalCardsInDeck(variant);

  return {
    order,
    location: order < totalCardsInDeck ? "deck" : "playStack",
    suitIndex: null,
    rank: null,
    possibleCardsFromClues: possibleCards,
    possibleCards,
    possibleCardsForEmpathy: possibleCards,
    revealedToPlayer: newArray(numPlayers, false),
    positiveColorClues: [],
    positiveRankClues: [],
    suitDetermined: false,
    rankDetermined: false,
    hasClueApplied: false,
    numPositiveClues: 0,
    segmentDrawn: null,
    segmentFirstClued: null,
    segmentPlayed: null,
    segmentDiscarded: null,
    isMisplayed: false,
    dealtToStartingHand: false,
    firstCluedWhileOnChop: null,
    inDoubleDiscard: false,
    isKnownTrashFromEmpathy: false,
  };
}
