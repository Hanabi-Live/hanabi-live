import * as deckRules from '../../rules/deck';
import CardState, { PipState } from '../../types/CardState';
import Variant from '../../types/Variant';

export default function initialCardState(order: number, variant: Variant) : CardState {
  // Possible suits and ranks (based on clues given) are tracked separately
  // from knowledge of the true suit and rank
  const possibleSuits: number[] = variant.suits.slice().map((_, i) => i);
  const possibleRanks: number[] = variant.ranks.slice();
  const possibleCards: number[][] = [];

  const possibleCardsByClues: Array<[number, number]> = [];
  for (const suitIndex of possibleSuits) {
    for (const rank of possibleRanks) {
      possibleCardsByClues.push([suitIndex, rank]);
    }
  }

  // Possible cards (based on both clues given and cards seen) are also tracked separately
  possibleSuits.forEach((suitIndex) => {
    possibleCards[suitIndex] = [];
    const suit = variant.suits[suitIndex];
    possibleRanks.forEach((rank) => {
      possibleCards[suitIndex][rank] = deckRules.numCopiesOfCard(variant, suit, rank);
    });
  });

  // Mark all rank pips as visible
  // Note that since we are using an array as a map, there will be gaps on the values
  const rankPipStates: PipState[] = [];
  possibleRanks.forEach((r) => { rankPipStates[r] = r >= 1 && r <= 5 ? 'Visible' : 'Hidden'; });

  return {
    order,
    location: 'deck',
    blank: false,
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
    possibleCardsByClues,
    identityDetermined: false,
    numPositiveClues: 0,
    turnsClued: [],
    turnDrawn: -1,
    turnDiscarded: -1,
    turnPlayed: -1,
    isMisplayed: false,
  };
}
