// Functions for calculating running statistics such as efficiency and pace
// as a result of each action

import produce, { Draft } from 'immer';
import { VARIANTS } from '../data/gameData';
import * as cardRules from '../rules/card';
import * as clueTokensRules from '../rules/clueTokens';
import * as statsRules from '../rules/stats';
import { GameAction } from '../types/actions';
import GameMetadata from '../types/GameMetadata';
import GameState, { StateStats } from '../types/GameState';

const statsReducer = produce((
  stats: Draft<StateStats>,
  action: GameAction,
  originalState: GameState,
  currentState: GameState,
  metadata: GameMetadata,
) => {
  const variant = VARIANTS.get(metadata.options.variantName)!;
  if (variant === undefined) {
    throw new Error(`Unable to find the "${metadata.options.variantName}" variant in the "VARIANTS" map.`);
  }

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
      const card = originalState.deck[action.which.order];
      if (cardRules.isClued(card)) {
        // A clued card was discarded
        stats.cardsGotten -= 1;
      }
      break;
    }

    case 'strike': {
      // TODO move this check to the play action when we have logic for knowing which cards play
      // A strike is equivalent to losing a clue
      stats.potentialCluesLost += clueTokensRules.clueValue(variant);
      break;
    }

    case 'play': {
      if (
        currentState.playStacks[action.which.suit].length === 5
        && originalState.clueTokens === currentState.clueTokens
      ) {
        // If we finished a stack while at max clues, then the extra clue is "wasted",
        // similar to what happens when the team gets a strike
        stats.potentialCluesLost += clueTokensRules.clueValue(variant);
      }

      const card = originalState.deck[action.which.order];
      if (!cardRules.isClued(card)) {
        // A card was blind played
        stats.cardsGotten += 1;
      }
      break;
    }

    default:
      break;
  }

  // Now that the action has occurred, update the stats relating to the current game state
  stats.pace = statsRules.pace(
    currentState.score,
    currentState.deckSize,
    currentState.maxScore,
    metadata.options.numPlayers,
  );
  stats.paceRisk = statsRules.paceRisk(stats.pace, metadata.options.numPlayers);
  stats.efficiency = statsRules.efficiency(stats.cardsGotten, stats.potentialCluesLost);
}, {} as StateStats);

export default statsReducer;
