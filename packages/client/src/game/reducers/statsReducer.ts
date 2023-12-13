// Functions for calculating running statistics such as efficiency and pace as a result of each
// action.

import { getVariant } from "@hanabi/data";
import { sumArray } from "@hanabi/utils";
import type { Draft } from "immer";
import { castDraft, produce } from "immer";
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
  statsState: Draft<StatsState>,
  action: GameAction,
  originalState: GameState,
  currentState: GameState,
  playing: boolean,
  shadowing: boolean,
  metadata: GameMetadata,
  ourNotes: readonly CardNote[] | null,
) {
  const variant = getVariant(metadata.options.variantName);

  switch (action.type) {
    case "clue": {
      // A clue was spent.
      statsState.potentialCluesLost++;

      break;
    }

    case "strike": {
      // TODO: move this check to the play action when we have logic for knowing which cards play.
      // A strike is equivalent to losing a clue. But do not reveal that a strike has happened to
      // players in an ongoing "Throw It in a Hole" game.
      if (!variant.throwItInAHole || (!playing && !shadowing)) {
        statsState.potentialCluesLost += clueTokensRules.discardValue(variant);
      }

      break;
    }

    case "play": {
      if (action.suitIndex !== -1) {
        const playStack = currentState.playStacks[action.suitIndex];

        if (
          playStack !== undefined &&
          playStack.length === variant.stackSize &&
          originalState.clueTokens === currentState.clueTokens &&
          !variant.throwItInAHole // We do not get an extra clue in some variants.
        ) {
          // If we finished a stack while at max clues, then the extra clue is "wasted", similar to
          // what happens when the team gets a strike.
          statsState.potentialCluesLost +=
            clueTokensRules.discardValue(variant);
        }
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
    statsState.maxScorePerStack = statsRules.getMaxScorePerStack(
      currentState.deck,
      currentState.playStackDirections,
      currentState.playStackStarts,
      variant,
    );

    statsState.maxScore = sumArray(statsState.maxScorePerStack);
  }

  // Handle pace calculation.
  const score =
    variant.throwItInAHole && (playing || shadowing)
      ? currentState.numAttemptedCardsPlayed
      : currentState.score;
  statsState.pace = statsRules.pace(
    score,
    currentState.cardsRemainingInTheDeck,
    statsState.maxScore,
    numEndGameTurns,
    // `currentPlayerIndex` will be null if the game is over.
    currentState.turn.currentPlayerIndex === null,
  );
  statsState.paceRisk = statsRules.paceRisk(
    statsState.pace,
    metadata.options.numPlayers,
  );

  // Handle efficiency calculation.
  statsState.cardsGotten = statsRules.cardsGotten(
    currentState.deck,
    currentState.playStacks,
    currentState.playStackDirections,
    currentState.playStackStarts,
    playing,
    shadowing,
    statsState.maxScore,
    variant,
  );
  statsState.cardsGottenByNotes =
    ourNotes === null
      ? null
      : statsRules.cardsGottenByNotes(
          currentState.deck,
          currentState.playStacks,
          currentState.playStackDirections,
          currentState.playStackStarts,
          variant,
          ourNotes,
        );

  // Handle future efficiency calculation.
  const scorePerStack = currentState.playStacks.map(
    (playStack) => playStack.length,
  );
  statsState.cluesStillUsable = statsRules.cluesStillUsable(
    score,
    scorePerStack,
    statsState.maxScorePerStack,
    variant.stackSize,
    currentState.cardsRemainingInTheDeck,
    numEndGameTurns,
    clueTokensRules.discardValue(variant),
    clueTokensRules.suitValue(variant),
    clueTokensRules.getUnadjusted(currentState.clueTokens, variant),
  );
  statsState.cluesStillUsableNotRounded = statsRules.cluesStillUsableNotRounded(
    score,
    scorePerStack,
    statsState.maxScorePerStack,
    variant.stackSize,
    currentState.cardsRemainingInTheDeck,
    numEndGameTurns,
    clueTokensRules.discardValue(variant),
    clueTokensRules.suitValue(variant),
    clueTokensRules.getUnadjusted(currentState.clueTokens, variant),
  );

  // Check if final round has effectively started because it is guaranteed to start in a fixed
  // number of turns.
  statsState.finalRoundEffectivelyStarted =
    currentState.cardsRemainingInTheDeck <= 0 ||
    statsState.cluesStillUsable === null ||
    statsState.cluesStillUsable < 1;

  // Handle double discard calculation.
  if (action.type === "discard") {
    statsState.doubleDiscard = statsRules.doubleDiscard(
      action.order,
      currentState,
      variant,
    );
  } else if (action.type === "play" || action.type === "clue") {
    statsState.doubleDiscard = null;
  }

  // Record the last action.
  statsState.lastAction = castDraft(action);

  // Find out which sound effect to play (if this is an ongoing game).
  statsState.soundTypeForLastAction = getSoundType(
    statsState,
    action,
    originalState,
    currentState,
    metadata,
  );
}
