/* eslint-disable unicorn/no-null */

import type {
  CardOrder,
  NumPlayers,
  SuitIndex,
  SuitRankTuple,
  Variant,
} from "@hanabi/data";
import { newArray } from "isaacscript-common-ts";
import type { CardState } from "../../interfaces/CardState";
import { getTotalCardsInDeck } from "../../rules/deck";

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
