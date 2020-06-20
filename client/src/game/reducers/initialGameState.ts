import * as deck from '../rules/deck';
import * as statsRules from '../rules/stats';
import { MAX_CLUE_NUM } from '../types/constants';
import GameState from '../types/GameState';
import StackDirection from '../types/StackDirection';
import Variant from '../types/Variant';

export default function initialGameState(variant: Variant, playerCount: number): GameState {
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
