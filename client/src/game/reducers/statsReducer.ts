// Functions for calculating running statistics such as efficiency and pace
// as a result of each action

import produce, { Draft } from "immer";
import { ensureAllCases } from "../../misc";
import { getVariant } from "../data/gameData";
import { clueTokensRules, turnRules, variantRules } from "../rules";
import * as statsRules from "../rules/stats";
import { GameAction } from "../types/actions";
import GameMetadata from "../types/GameMetadata";
import GameState from "../types/GameState";
import StatsState from "../types/StatsState";
import getSoundType from "./getSoundType";

const statsReducer = produce(statsReducerFunction, {} as StatsState);
export default statsReducer;

function statsReducerFunction(
  stats: Draft<StatsState>,
  action: GameAction,
  originalState: GameState,
  currentState: GameState,
  playing: boolean,
  metadata: GameMetadata,
) {
  const variant = getVariant(metadata.options.variantName);

  switch (action.type) {
    case "clue": {
      // A clue was spent
      stats.potentialCluesLost += 1;
      stats.doubleDiscard = false;

      break;
    }

    case "strike": {
      // TODO: move this check to the play action when we have logic for knowing which cards play
      // A strike is equivalent to losing a clue
      // But don't reveal that a strike has happened to players in an ongoing "Throw It in a Hole"
      // game
      if (!variantRules.isThrowItInAHole(variant) || !playing) {
        stats.potentialCluesLost += clueTokensRules.discardValue(variant);
      }

      break;
    }

    case "play": {
      if (
        !variantRules.isThrowItInAHole(variant) && // We don't get an extra clue in these variants
        currentState.playStacks[action.suitIndex].length === 5 && // Hard code stack length to 5
        originalState.clueTokens === currentState.clueTokens
      ) {
        // If we finished a stack while at max clues, then the extra clue is "wasted",
        // similar to what happens when the team gets a strike
        stats.potentialCluesLost += clueTokensRules.discardValue(variant);
      }
      stats.doubleDiscard = false;

      break;
    }

    case "discard": {
      // Handle double discard calculation
      stats.doubleDiscard = statsRules.doubleDiscard(
        action.order,
        currentState,
        variant,
      );
      break;
    }

    case "gameOver": {
      // Record the last action
      stats.lastAction = action;

      // Find out which sound effect to play (if this is an ongoing game)
      stats.soundTypeForLastAction = getSoundType(
        stats,
        action,
        originalState,
        currentState,
        metadata,
      );
      return;
    }

    case "draw":
    case "cardIdentity":
    case "turn":
    case "playerTimes":
      return;

    default: {
      ensureAllCases(action);
      return;
    }
  }

  // Various stat calculation is below; this code only runs on play, discard, clue, or strike actions

  const actionDrewCard =
    action.type !== "clue" && originalState.cardsRemainingInTheDeck >= 1;
  const deckSize =
    originalState.cardsRemainingInTheDeck - (actionDrewCard ? 1 : 0);

  // Handle max score calculation
  if (action.type === "play" || action.type === "discard") {
    stats.maxScorePerStack = statsRules.getMaxScorePerStack(
      currentState.deck,
      currentState.playStackDirections,
      variant,
    );
    stats.maxScore = stats.maxScorePerStack.reduce((a, b) => a + b, 0);
  }

  // Handle pace calculation
  const score =
    variantRules.isThrowItInAHole(variant) && playing
      ? currentState.numAttemptedCardsPlayed
      : currentState.score;
  stats.pace = statsRules.pace(
    score,
    deckSize,
    stats.maxScore,
    metadata.options.numPlayers,
    // currentPlayerIndex will be null if the game is over
    currentState.turn.currentPlayerIndex === null,
  );
  stats.paceRisk = statsRules.paceRisk(stats.pace, metadata.options.numPlayers);

  // Handle efficiency calculation
  stats.cardsGotten = statsRules.cardsGotten(
    currentState.deck,
    currentState.playStacks,
    currentState.playStackDirections,
    playing,
    stats.maxScore,
    variant,
  );

  // Handle future efficiency calculation
  const scorePerStack: number[] = Array.from(
    currentState.playStacks,
    (playStack) => playStack.length,
  );
  stats.cluesStillUsable = statsRules.cluesStillUsable(
    scorePerStack,
    stats.maxScorePerStack,
    deckSize,
    turnRules.endGameLength(metadata.options, metadata.characterAssignments),
    clueTokensRules.discardValue(variant),
    clueTokensRules.suitValue(variant),
    clueTokensRules.getUnadjusted(currentState.clueTokens, variant),
  );

  // Check if final round has effectively started because it is guaranteed to start in a fixed number of turns
  stats.finalRoundEffectivelyStarted =
    deckSize <= 0 ||
    stats.cluesStillUsable === null ||
    stats.cluesStillUsable < 1;

  // Record the last action
  stats.lastAction = action;

  // Find out which sound effect to play (if this is an ongoing game)
  stats.soundTypeForLastAction = getSoundType(
    stats,
    action,
    originalState,
    currentState,
    metadata,
  );
}
