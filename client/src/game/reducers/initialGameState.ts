import { VARIANTS } from '../data/gameData';
import * as deck from '../rules/deck';
import * as statsRules from '../rules/stats';
import { MAX_CLUE_NUM } from '../types/constants';
import GameState, { StateOptions } from '../types/GameState';
import StackDirection from '../types/StackDirection';
import initialTurnState from './initialTurnState';

export default function initialGameState(options: StateOptions): GameState {
  const variant = VARIANTS.get(options.variantName);
  if (variant === undefined) {
    throw new Error(`Unable to find the "${options.variantName}" variant in the "VARIANTS" map.`);
  }
  const turnState = initialTurnState(options.startingPlayer);
  const startingPace = statsRules.startingPace(
    options.numPlayers,
    variant,
    options.oneExtraCard,
    options.oneLessCard,
  );
  const hands: number[][] = [];
  const playStacksDirections: StackDirection[] = [];
  const playStacks: number[][] = [];
  const discardStacks: number[][] = [];

  for (let i = 0; i < options.numPlayers; i++) {
    hands.push([]);
  }

  for (let i = 0; i < variant.suits.length; i++) {
    playStacksDirections.push(StackDirection.Undecided);
    playStacks.push([]);
    discardStacks.push([]);
  }

  return {
    turn: turnState.turn,
    log: [],
    deck: [],
    deckSize: deck.totalCards(variant),
    score: 0,
    clueTokens: MAX_CLUE_NUM,
    doubleDiscard: false,
    strikes: [],
    currentPlayerIndex: turnState.currentPlayerIndex,
    hands,
    playStacks,
    playStacksDirections,
    discardStacks,
    clues: [],
    stats: {
      cardsGotten: 0,
      potentialCluesLost: 0,
      efficiency: Infinity,
      pace: startingPace,
      paceRisk: statsRules.paceRisk(options.numPlayers, startingPace),
      maxScore: variant.maxScore,
    },
    options,
  };
}
