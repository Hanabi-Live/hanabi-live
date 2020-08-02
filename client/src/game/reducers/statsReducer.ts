// Functions for calculating running statistics such as efficiency and pace
// as a result of each action

import produce, { Draft } from 'immer';
import { getVariant } from '../data/gameData';
import { variantRules } from '../rules';
import * as clueTokensRules from '../rules/clueTokens';
import * as statsRules from '../rules/stats';
import { GameAction } from '../types/actions';
import GameMetadata from '../types/GameMetadata';
import GameState from '../types/GameState';
import StatsState from '../types/StatsState';

const statsReducer = produce((
  stats: Draft<StatsState>,
  action: GameAction,
  originalState: GameState,
  currentState: GameState,
  playing: boolean,
  metadata: GameMetadata,
) => {
  const variant = getVariant(metadata.options.variantName);

  switch (action.type) {
    case 'clue': {
      // A clue was spent
      stats.potentialCluesLost += 1;

      break;
    }

    case 'strike': {
      // TODO: move this check to the play action when we have logic for knowing which cards play
      // A strike is equivalent to losing a clue
      // But don't reveal that a strike has happened to players in an ongoing "Throw It in a Hole"
      // game
      if (!variantRules.isThrowItInAHole(variant) || !playing) {
        stats.potentialCluesLost += clueTokensRules.value(variant);
      }

      break;
    }

    case 'play': {
      if (
        !variantRules.isThrowItInAHole(variant) // We don't get an extra clue in these variants
        && currentState.playStacks[action.suitIndex].length === 5 // Hard code stack length to 5
        && originalState.clueTokens === currentState.clueTokens
      ) {
        // If we finished a stack while at max clues, then the extra clue is "wasted",
        // similar to what happens when the team gets a strike
        stats.potentialCluesLost += clueTokensRules.value(variant);
      }

      break;
    }

    default: {
      break;
    }
  }

  // Handle double discard calculation
  if (action.type === 'discard') {
    stats.doubleDiscard = statsRules.doubleDiscard(
      action.order,
      currentState.deck,
      currentState.playStacks,
      currentState.playStackDirections,
      variant,
    );
  } else if (action.type === 'play' || action.type === 'clue') {
    stats.doubleDiscard = false;
  }

  // Handle max score calculation
  if (action.type === 'play' || action.type === 'discard') {
    stats.maxScore = statsRules.getMaxScore(
      currentState.deck,
      currentState.playStackDirections,
      variant,
    );
  }

  // Handle pace calculation
  const score = variantRules.isThrowItInAHole(variant) && playing
    ? currentState.numAttemptedCardsPlayed
    : currentState.score;
  stats.pace = statsRules.pace(
    score,
    currentState.deckSize,
    stats.maxScore,
    metadata.options.numPlayers,
    // currentPlayerIndex will be null if the game is over
    currentState.turn.currentPlayerIndex === null,
  );
  stats.paceRisk = statsRules.paceRisk(stats.pace, metadata.options.numPlayers);

  // Handle efficiency calculation
  const cardsGotten = statsRules.cardsGotten(
    currentState.deck,
    currentState.playStacks,
    currentState.playStackDirections,
    playing,
    variant,
  );
  stats.efficiency = statsRules.efficiency(cardsGotten, stats.potentialCluesLost);
}, {} as StatsState);

export default statsReducer;
