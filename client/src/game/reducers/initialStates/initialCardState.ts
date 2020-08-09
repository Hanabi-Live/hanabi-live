import * as deckRules from '../../rules/deck';
import CardState from '../../types/CardState';
import Variant from '../../types/Variant';

export default function initialCardState(order: number, variant: Variant) : CardState {
  // Possible suits and ranks (based on clues given) are tracked separately
  // from knowledge of the true suit and rank
  const possibleSuits: number[] = variant.suits.slice().map((_, i) => i);
  const possibleRanks: number[] = variant.ranks.slice();
  const possibleCardsFromObservation: number[][] = [];
  const possibleCardsFromInference: number[][] = [];

  const possibleCardsFromClues: Array<[number, number]> = [];
  const possibleCardsFromInference2: Array<[number, number]> = [];
  for (const suitIndex of possibleSuits) {
    for (const rank of possibleRanks) {
      possibleCardsFromClues.push([suitIndex, rank]);
      possibleCardsFromInference2.push([suitIndex, rank]);
    }
  }

  // Possible cards (based on both clues given and cards seen) are also tracked separately
  possibleSuits.forEach((suitIndex) => {
    possibleCardsFromObservation[suitIndex] = [];
    possibleCardsFromInference[suitIndex] = [];
    const suit = variant.suits[suitIndex];
    possibleRanks.forEach((rank) => {
      const copies = deckRules.numCopiesOfCard(
        suit,
        rank,
        variant,
      );
      possibleCardsFromObservation[suitIndex][rank] = copies;
      possibleCardsFromInference[suitIndex][rank] = copies;
    });
  });

  return {
    order,
    location: 'deck',
    suitIndex: null,
    rank: null,
    possibleCardsFromObservation,
    possibleCardsFromClues,
    possibleCardsFromInference,
    possibleCardsFromInference2,
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
