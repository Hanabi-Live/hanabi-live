import { initArray } from '../../../misc';
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
  const hands: number[][] = initArray(options.numPlayers, []);
  const playStackDirections: StackDirection[] = initArray(
    variant.suits.length,
    StackDirection.Undecided,
  );
  const playStacks: number[][] = initArray(variant.suits.length, []);
  const discardStacks: number[][] = initArray(variant.suits.length, []);

  return {
    turn: turnState,
    log: [],
    deck: [],
    deckSize: deck.totalCards(variant),
    score: 0,
    numAttemptedCardsPlayed: 0,
    clueTokens: MAX_CLUE_NUM,
    strikes: [],
    hands,
    playStacks,
    playStackDirections,
    discardStacks,
    clues: [],
    stats: {
      maxScore: variant.maxScore,
      doubleDiscard: false,
      cardsGotten: 0,
      potentialCluesLost: 0,
      efficiency: Infinity,
      pace: startingPace,
      paceRisk: statsRules.paceRisk(options.numPlayers, startingPace),
    },
  };
}
