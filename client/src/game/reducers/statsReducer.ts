// Functions for calculating running statistics such as efficiency and pace
// as a result of each action

import produce, { Draft } from 'immer';
import { getVariant } from '../data/gameData';
import * as cardRules from '../rules/card';
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
  metadata: GameMetadata,
) => {
  const variant = getVariant(metadata.options.variantName);

  switch (action.type) {
    case 'clue': {
      // A clue was spent
      stats.potentialCluesLost += 1;

      // Count cards that were newly gotten
      for (let i = 0; i < action.list.length; i++) {
        const order = action.list[i];
        const card = originalState.deck[order];
        if (!cardRules.isClued(card)) {
          // A card was newly clued
          stats.cardsGotten += 1;
        }
      }
      break;
    }

    case 'discard': {
      const card = originalState.deck[action.order];
      if (cardRules.isClued(card)) {
        // A clued card was discarded
        stats.cardsGotten -= 1;
      }

      break;
    }

    case 'strike': {
      // TODO move this check to the play action when we have logic for knowing which cards play
      // A strike is equivalent to losing a clue
      stats.potentialCluesLost += clueTokensRules.value(variant);
      break;
    }

    case 'play': {
      if (
        currentState.playStacks[action.suitIndex].length === 5
        && originalState.clueTokens === currentState.clueTokens
      ) {
        // If we finished a stack while at max clues, then the extra clue is "wasted",
        // similar to what happens when the team gets a strike
        stats.potentialCluesLost += clueTokensRules.value(variant);
      }

      const card = originalState.deck[action.order];
      if (!cardRules.isClued(card)) {
        // A card was blind played
        stats.cardsGotten += 1;
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
      variant,
      action.order,
      currentState.deck,
      currentState.playStacks,
      currentState.playStackDirections,
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

  // Now that the action has occurred, update the stats relating to the current game state
  stats.pace = statsRules.pace(
    currentState.score,
    currentState.deckSize,
    stats.maxScore,
    metadata.options.numPlayers,
    // currentPlayerIndex will be null if the game is over
    currentState.turn.currentPlayerIndex === null,
  );
  stats.paceRisk = statsRules.paceRisk(stats.pace, metadata.options.numPlayers);
  stats.efficiency = statsRules.efficiency(stats.cardsGotten, stats.potentialCluesLost);
}, {} as StatsState);

export default statsReducer;
