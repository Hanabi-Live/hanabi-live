import { newArray } from "complete-common";
import type { CardState } from "../../interfaces/CardState.js";
import type { Variant } from "../../interfaces/Variant.js";
import { getTotalCardsInDeck } from "../../rules/deck.js";
import type { CardOrder } from "../../types/CardOrder.js";
import type { NumPlayers } from "../../types/NumPlayers.js";
import type { SuitIndex } from "../../types/SuitIndex.js";
import type { SuitRankTuple } from "../../types/SuitRankTuple.js";

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
    suitIndex: undefined,
    rank: undefined,
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
    segmentDrawn: undefined,
    segmentFirstClued: undefined,
    segmentPlayed: undefined,
    segmentDiscarded: undefined,
    isMisplayed: false,
    dealtToStartingHand: false,
    firstCluedWhileOnChop: undefined,
    inDoubleDiscard: false,
    isKnownTrashFromEmpathy: false,
  };
}
