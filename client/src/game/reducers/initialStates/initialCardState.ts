import CardState from '../../types/CardState';
import Variant from '../../types/Variant';

export default function initialCardState(order: number, variant: Variant) : CardState {
  // Possible suits and ranks (based on clues given) are tracked separately
  // from knowledge of the true suit and rank
  const possibleSuits: number[] = variant.suits.slice().map((_, i) => i);
  const possibleRanks: number[] = variant.ranks.slice();

  const possibleCards: Array<[number, number]> = [];
  possibleSuits.forEach((s) => possibleRanks.forEach((r) => possibleCards.push([s, r])));

  return {
    order,
    location: 'deck',
    suitIndex: null,
    rank: null,
    possibleCardsFromClues: possibleCards,
    possibleCardsFromDeduction: possibleCards,
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
