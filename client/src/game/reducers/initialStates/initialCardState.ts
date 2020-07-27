import * as deckRules from '../../rules/deck';
import CardState, { PipState } from '../../types/CardState';
import Variant from '../../types/Variant';

export default function initialCardState(order: number, variant: Variant) : CardState {
  // Possible suits and ranks (based on clues given) are tracked separately
  // from knowledge of the true suit and rank
  const possibleSuits = variant.suits.slice().map((_, i) => i);
  const possibleRanks = variant.ranks.slice();
  const possibleCards: number[][] = [];

  // Possible cards (based on both clues given and cards seen) are also tracked separately
  possibleSuits.forEach((suitIndex) => {
    possibleCards[suitIndex] = [];
    const suit = variant.suits[suitIndex];
    possibleRanks.forEach((rank) => {
      possibleCards[suitIndex][rank] = deckRules.numCopiesOfCard(suit, rank, variant);
    });
  });

  // Mark all rank pips as visible
  // Note that since we are using an array as a map, there will be gaps on the values
  const rankPipStates: PipState[] = [];
  possibleRanks.forEach((r) => {
    rankPipStates[r] = r >= 1 && r <= 5 ? 'Visible' : 'Hidden';
  });

  return {
    order,
    location: 'deck',
    suitIndex: null,
    rank: null,
    possibleCards,
    colorClueMemory: {
      possibilities: possibleSuits,
      positiveClues: [],
      negativeClues: [],
      pipStates: possibleSuits.map(() => 'Visible'),
    },
    rankClueMemory: {
      possibilities: possibleRanks,
      positiveClues: [],
      negativeClues: [],
      pipStates: rankPipStates,
    },
    identityDetermined: false,
    numPositiveClues: 0,
    segmentDrawn: null,
    segmentFirstClued: null,
    segmentPlayed: null,
    segmentDiscarded: null,
    isMisplayed: false,
  };
}
