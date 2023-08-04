import { Variant, newArray } from "@hanabi/data";
import * as deck from "../../rules/deck";
import { CardState } from "../../types/CardState";

export function initialCardState(order: number, variant: Variant): CardState {
  // Possible suits and ranks (based on clues given) are tracked separately from knowledge of the
  // true suit and rank.
  const possibleSuits: number[] = [...variant.suits].map((_, i) => i);
  const possibleRanks: number[] = [...variant.ranks];

  const possibleCards: Array<[number, number]> = [];
  for (const s of possibleSuits) {
    for (const r of possibleRanks) {
      possibleCards.push([s, r]);
    }
  }

  const total = deck.totalCards(variant);

  return {
    order,
    location: order < total ? "deck" : "playStack",
    suitIndex: null,
    rank: null,
    possibleCardsFromClues: possibleCards,
    possibleCards,
    possibleCardsForEmpathy: possibleCards,
    revealedToPlayer: newArray(6, false),
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
