import { getVariant } from '../../data/gameData';
import * as deck from '../../rules/deck';
import * as hand from '../../rules/hand';
import * as statsRules from '../../rules/stats';
import { MAX_CLUE_NUM } from '../../types/constants';
import GameMetadata from '../../types/GameMetadata';
import GameState from '../../types/GameState';
import StackDirection from '../../types/StackDirection';
import initialTurnState from './initialTurnState';

export default function initialGameState(metadata: GameMetadata): GameState {
  const options = metadata.options;
  const variant = getVariant(options.variantName);
  const turnState = initialTurnState(options.startingPlayer);
  const cardsPerHand = hand.cardsPerHand(
    options.numPlayers,
    options.oneExtraCard,
    options.oneLessCard,
  );
  const startingPace = statsRules.startingPace(options.numPlayers, cardsPerHand, variant);
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
    maxScore: variant.maxScore,
    clueTokens: MAX_CLUE_NUM,
    doubleDiscard: false,
    strikes: [],
    currentPlayerIndex: turnState.currentPlayerIndex,
    turnsInverted: false,
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
    },
    cardsPlayedOrDiscardedThisTurn: 0,
    cluesGivenThisTurn: 0,
  };
}
