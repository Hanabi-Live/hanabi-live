import * as deckRules from '../../rules/deck';
import CardState from '../../types/CardState';
import Variant from '../../types/Variant';

export default function initialCardState(order: number, variant: Variant) : CardState {
  // Possible suits and ranks (based on clues given) are tracked separately
  // from knowledge of the true suit and rank
  const possibleSuits: number[] = variant.suits.slice().map((_, i) => i);
  const possibleRanks: number[] = variant.ranks.slice();
  const possibleCardsFromObservation: number[][] = [];

  const possibleCardsFromClues: Array<[number, number]> = [];
  for (const suitIndex of possibleSuits) {
    for (const rank of possibleRanks) {
      possibleCardsFromClues.push([suitIndex, rank]);
    }
  }

  // Possible cards (based on both clues given and cards seen) are also tracked separately
  possibleSuits.forEach((suitIndex) => {
    possibleCardsFromObservation[suitIndex] = [];
    const suit = variant.suits[suitIndex];
    possibleRanks.forEach((rank) => {
      possibleCardsFromObservation[suitIndex][rank] = deckRules.numCopiesOfCard(
        suit,
        rank,
        variant,
      );
    });
  });

  return {
    order,
    location: 'deck',
    suitIndex: null,
    rank: null,
    possibleCardsFromObservation,
    possibleCardsFromClues,
    positiveRankClues: [],
    suitDetermined: false,
    rankDetermined: false,
    numPositiveClues: 0,
    segmentDrawn: null,
    segmentFirstClued: null,
    segmentPlayed: null,
    segmentDiscarded: null,
    isMisplayed: false,
  };
}
