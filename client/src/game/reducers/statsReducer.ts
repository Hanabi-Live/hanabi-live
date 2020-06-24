// Functions for calculating running statistics such as efficiency and pace
// as a result of each action

import produce, { Draft } from 'immer';
import { VARIANTS } from '../data/gameData';
import * as cluesRules from '../rules/clues';
import * as statsRules from '../rules/stats';
import { GameAction } from '../types/actions';
import GameState, { StateStats } from '../types/GameState';
import Options from '../types/Options';

const statsReducer = produce((
  stats: Draft<StateStats>,
  action: GameAction,
  originalState: GameState,
  currentState: GameState,
  options: Options,
) => {
  const variant = VARIANTS.get(options.variantName)!;
  if (variant === undefined) {
    throw new Error(`Unable to find the "${options.variantName}" variant in the "VARIANTS" map.`);
  }

  switch (action.type) {
    case 'clue': {
      // A clue was spent
      stats.potentialCluesLost += 1;

      // Count cards that were newly gotten
      for (let i = 0; i < action.list.length; i++) {
        const order = action.list[i];
        const card = originalState.deck[order];
        if (!cluesRules.isClued(card)) {
          // A card was newly clued
          stats.cardsGotten += 1;
        }
      }
      break;
    }

    case 'discard': {
      const card = originalState.deck[action.which.order];
      if (cluesRules.isClued(card)) {
        // A clued card was discarded
        stats.cardsGotten -= 1;
      }
      break;
    }

    case 'strike': {
      // TODO move this check to the play action when we have logic for knowing which cards play
      // A strike is equivalent to losing a clue
      stats.potentialCluesLost += cluesRules.clueValue(variant);
      break;
    }

    case 'play': {
      if (
        currentState.playStacks[action.which.suit].length === 5
        && originalState.clueTokens === currentState.clueTokens
      ) {
        // If we finished a stack while at max clues, then the extra clue is "wasted",
        // similar to what happens when the team gets a strike
        stats.potentialCluesLost += cluesRules.clueValue(variant);
      }

      const card = originalState.deck[action.which.order];
      if (!cluesRules.isClued(card)) {
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
    options.numPlayers,
  );
  stats.paceRisk = statsRules.paceRisk(stats.pace, options.numPlayers);
  stats.efficiency = statsRules.efficiency(stats.cardsGotten, stats.potentialCluesLost);
}, {} as StateStats);

export default statsReducer;
