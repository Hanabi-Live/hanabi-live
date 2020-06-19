import * as deck from '../rules/deck';
import * as statsRules from '../rules/stats';
import { MAX_CLUE_NUM } from '../types/constants';
import StackDirection from '../types/StackDirection';
import State from '../types/State';
import Variant from '../types/Variant';

export default function initialState(variant: Variant, playerCount: number): State {
  const startingPace = statsRules.startingPace(variant, playerCount);

  const hands: number[][] = [];
  const playStacksDirections: StackDirection[] = [];
  const playStacks: number[][] = [];
  const discardStacks: number[][] = [];

  for (let i = 0; i < playerCount; i++) {
    hands.push([]);
  }
  for (let i = 0; i < variant.suits.length; i++) {
    playStacksDirections.push(StackDirection.Undecided);
    playStacks.push([]);
    discardStacks.push([]);
  }

  return {
    variantName: variant.name,
    log: [],
    deck: [],
    deckSize: deck.totalCards(variant),
    score: 0,
    clueTokens: MAX_CLUE_NUM,
    doubleDiscard: false,
    strikes: [],
    pace: 0,
    currentPlayerIndex: 0,
    hands,
    playStacks,
    playStacksDirections,
    discardStacks,
    clues: [],
    stats: {
      cardsGotten: 0,
      potentialCluesLost: 0,
      efficiency: 0,
      pace: startingPace,
      paceRisk: statsRules.paceRisk(startingPace, playerCount),
      maxScore: variant.maxScore,
    },
  };
}
