// Functions for calculating running statistics such as efficiency and pace as a result of each
// action.

import { getVariant } from "@hanabi/data";
import type { Draft } from "immer";
import { produce } from "immer";
import * as clueTokensRules from "../rules/clueTokens";
import * as statsRules from "../rules/stats";
import * as turnRules from "../rules/turn";
import type { CardNote } from "../types/CardNote";
import type { GameMetadata } from "../types/GameMetadata";
import type { GameState } from "../types/GameState";
import type { StatsState } from "../types/StatsState";
import type { GameAction } from "../types/actions";
import { getSoundType } from "./getSoundType";

export const statsReducer = produce(statsReducerFunction, {} as StatsState);

function statsReducerFunction(
  stats: Draft<StatsState>,
  action: GameAction,
  originalState: GameState,
  currentState: GameState,
  playing: boolean,
  shadowing: boolean,
  metadata: GameMetadata,
  ourNotes: CardNote[] | null,
) {
  const variant = getVariant(metadata.options.variantName);

  switch (action.type) {
    case "clue": {
      // A clue was spent.
      stats.potentialCluesLost++;

      break;
    }

    case "strike": {
      // TODO: move this check to the play action when we have logic for knowing which cards play.
      // A strike is equivalent to losing a clue. But do not reveal that a strike has happened to
      // players in an ongoing "Throw It in a Hole" game.
      if (!variant.throwItInAHole || (!playing && !shadowing)) {
        stats.potentialCluesLost += clueTokensRules.discardValue(variant);
      }

      break;
    }

    case "play": {
      if (
        !variant.throwItInAHole && // We do not get an extra clue in some variants.
        // Hard code the stack length to 5.
        currentState.playStacks[action.suitIndex]!.length === 5 &&
        originalState.clueTokens === currentState.clueTokens
      ) {
        // If we finished a stack while at max clues, then the extra clue is "wasted", similar to
        // what happens when the team gets a strike.
        stats.potentialCluesLost += clueTokensRules.discardValue(variant);
      }

      break;
    }

    default: {
      break;
    }
  }

  const numEndGameTurns = turnRules.endGameLength(
    metadata.options,
    metadata.characterAssignments,
  );

  // Handle max score calculation.
  if (action.type === "play" || action.type === "discard") {
    stats.maxScorePerStack = statsRules.getMaxScorePerStack(
      currentState.deck,
      currentState.playStackDirections,
      currentState.playStackStarts,
      variant,
    );
    stats.maxScore = stats.maxScorePerStack.reduce((a, b) => a + b, 0);
  }

  // Handle pace calculation.
  const score =
    variant.throwItInAHole && (playing || shadowing)
      ? currentState.numAttemptedCardsPlayed
      : currentState.score;
  stats.pace = statsRules.pace(
    score,
    currentState.cardsRemainingInTheDeck,
    stats.maxScore,
    numEndGameTurns,
    // `currentPlayerIndex` will be null if the game is over.
    currentState.turn.currentPlayerIndex === null,
  );
  stats.paceRisk = statsRules.paceRisk(stats.pace, metadata.options.numPlayers);

  // Handle efficiency calculation.
  stats.cardsGotten = statsRules.cardsGotten(
    currentState.deck,
    currentState.playStacks,
    currentState.playStackDirections,
    currentState.playStackStarts,
    playing,
    shadowing,
    stats.maxScore,
    variant,
  );
  stats.cardsGottenByNotes =
    ourNotes !== null
      ? statsRules.cardsGottenByNotes(
          currentState.deck,
          currentState.playStacks,
          currentState.playStackDirections,
          currentState.playStackStarts,
          variant,
          ourNotes,
        )
      : null;

  // Handle future efficiency calculation.
  const scorePerStack: number[] = Array.from(
    currentState.playStacks,
    (playStack) => playStack.length,
  );
  stats.cluesStillUsable = statsRules.cluesStillUsable(
    score,
    scorePerStack,
    stats.maxScorePerStack,
    currentState.cardsRemainingInTheDeck,
    numEndGameTurns,
    clueTokensRules.discardValue(variant),
    clueTokensRules.suitValue(variant),
    clueTokensRules.getUnadjusted(currentState.clueTokens, variant),
  );
  stats.cluesStillUsableNotRounded = statsRules.cluesStillUsableNotRounded(
    score,
    scorePerStack,
    stats.maxScorePerStack,
    currentState.cardsRemainingInTheDeck,
    numEndGameTurns,
    clueTokensRules.discardValue(variant),
    clueTokensRules.suitValue(variant),
    clueTokensRules.getUnadjusted(currentState.clueTokens, variant),
  );

  // Check if final round has effectively started because it is guaranteed to start in a fixed
  // number of turns.
  stats.finalRoundEffectivelyStarted =
    currentState.cardsRemainingInTheDeck <= 0 ||
    stats.cluesStillUsable === null ||
    stats.cluesStillUsable < 1;

  // Handle double discard calculation.
  if (action.type === "discard") {
    stats.doubleDiscard = statsRules.doubleDiscard(
      action.order,
      currentState,
      variant,
    );
  } else if (action.type === "play" || action.type === "clue") {
    stats.doubleDiscard = null;
  }

  // Record the last action.
  stats.lastAction = action;

  // Find out which sound effect to play (if this is an ongoing game).
  stats.soundTypeForLastAction = getSoundType(
    stats,
    action,
    originalState,
    currentState,
    metadata,
  );
}
