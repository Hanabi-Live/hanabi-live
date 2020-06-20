// Functions for calculating running statistics such as efficiency and pace
// as a result of each action

// Imports
import produce, { Draft } from 'immer';
import { VARIANTS } from '../data/gameData';
import * as cluesRules from '../rules/clues';
import * as statsRules from '../rules/stats';
import { GameAction } from '../types/actions';
import GameState, { StateStats } from '../types/GameState';

const statsReducer = produce((
  stats: Draft<StateStats>,
  action: GameAction,
  originalState: GameState,
  currentState: GameState,
) => {
  // Shorthand since the variant is often passed as a parameter
  const v = VARIANTS.get(originalState.variantName)!;
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
      // A strike is equivalent to losing a clue
      stats.potentialCluesLost += cluesRules.clueValue(v);
      break;
    }

    case 'play': {
      if (
        currentState.playStacks[action.which.suit].length === 5
        && originalState.clueTokens === currentState.clueTokens
      ) {
        // If we finished a stack while at max clues, then the extra clue is "wasted",
        // similar to what happens when the team gets a strike
        stats.potentialCluesLost += cluesRules.clueValue(v);
      }

      const card = originalState.deck[action.which.order];
      if (!cluesRules.isClued(card)) {
        // A card was blind played
        stats.cardsGotten += 1;
      }
      break;
    }

    case 'status': {
      // TODO: calculate maxScore instead of using the server one
      stats.maxScore = action.maxScore;
      break;
    }

    default:
      break;
  }
  // We got the latest card stats, update pace and efficiency
  stats.pace = statsRules.pace(
    currentState.score,
    currentState.deckSize,
    stats.maxScore,
    currentState.hands.length,
  );
  stats.paceRisk = statsRules.paceRisk(stats.pace, currentState.hands.length);
  stats.efficiency = statsRules.efficiency(stats.cardsGotten, stats.potentialCluesLost);
}, {} as StateStats);

export default statsReducer;
