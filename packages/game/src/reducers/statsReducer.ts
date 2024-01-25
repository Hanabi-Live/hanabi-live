// Functions for calculating running statistics such as efficiency and pace as a result of each
// action.

/* eslint-disable no-param-reassign */
/* eslint-disable unicorn/no-null */

import type { Draft } from "immer";
import { produce } from "immer";
import { sumArray } from "isaacscript-common-ts";
import { getVariant } from "../gameData";
import type { CardNote } from "../interfaces/CardNote";
import type { GameMetadata } from "../interfaces/GameMetadata";
import type { GameState } from "../interfaces/GameState";
import type { StatsState } from "../interfaces/StatsState";
import type { Variant } from "../interfaces/Variant";
import { isCardClued } from "../rules/cardState";
import {
  getDiscardClueTokenValue,
  getSuitCompleteClueTokenValue,
  getUnadjustedClueTokens,
} from "../rules/clueTokens";
import {
  getCardsGotten,
  getCardsGottenByNotes,
  getCluesStillUsable,
  getCluesStillUsableNotRounded,
  getDoubleDiscardCard,
  getMaxScorePerStack,
  getPace,
  getPaceRisk,
} from "../rules/stats";
import { getEndGameLength } from "../rules/turn";
import type { GameAction } from "../types/gameActions";

export const statsReducer = produce(statsReducerFunction, {} as StatsState);

function statsReducerFunction(
  statsState: Draft<StatsState>,
  action: GameAction,
  previousGameState: GameState,
  gameState: GameState,
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
      // A strike is equivalent to losing a clue. But do not reveal that a strike has happened to
      // players in an ongoing "Throw It in a Hole" game.
      if (!variant.throwItInAHole || (!playing && !shadowing)) {
        statsState.potentialCluesLost += getDiscardClueTokenValue(variant);
      }

      break;
    }

    case "play": {
      if (action.suitIndex !== -1) {
        const playStack = gameState.playStacks[action.suitIndex];

        if (
          playStack !== undefined &&
          playStack.length === variant.stackSize &&
          previousGameState.clueTokens === gameState.clueTokens &&
          !variant.throwItInAHole // We do not get an extra clue in some variants.
        ) {
          // If we finished a stack while at max clues, then the extra clue is "wasted", similar to
          // what happens when the team gets a strike.
          statsState.potentialCluesLost += getDiscardClueTokenValue(variant);
        }
      }

      break;
    }

    default: {
      break;
    }
  }

  const numEndGameTurns = getEndGameLength(
    metadata.options,
    metadata.characterAssignments,
  );

  // Handle max score calculation.
  if (action.type === "play" || action.type === "discard") {
    statsState.maxScorePerStack = getMaxScorePerStack(
      gameState.deck,
      gameState.playStackDirections,
      gameState.playStackStarts,
      variant,
    );

    statsState.maxScore = sumArray(statsState.maxScorePerStack);
  }

  // Handle "numAttemptedCardsPlayed". (This needs to be before the pace calculation.)
  if ((action.type === "discard" && action.failed) || action.type === "play") {
    statsState.numAttemptedCardsPlayed++;
  }

  // Handle pace calculation.
  const score =
    variant.throwItInAHole && (playing || shadowing)
      ? statsState.numAttemptedCardsPlayed
      : gameState.score;
  statsState.pace = getPace(
    score,
    gameState.cardsRemainingInTheDeck,
    statsState.maxScore,
    numEndGameTurns,
    // `currentPlayerIndex` will be null if the game is over.
    gameState.turn.currentPlayerIndex === null,
  );
  statsState.paceRisk = getPaceRisk(
    statsState.pace,
    metadata.options.numPlayers,
  );

  // Handle efficiency calculation.
  statsState.cardsGotten = getCardsGotten(
    gameState.deck,
    gameState.playStacks,
    gameState.playStackDirections,
    gameState.playStackStarts,
    playing,
    shadowing,
    statsState.maxScore,
    variant,
  );
  statsState.cardsGottenByNotes =
    ourNotes === null
      ? null
      : getCardsGottenByNotes(
          gameState.deck,
          gameState.playStacks,
          gameState.playStackDirections,
          gameState.playStackStarts,
          variant,
          ourNotes,
        );

  // Handle future efficiency calculation.
  const scorePerStack = gameState.playStacks.map(
    (playStack) => playStack.length,
  );
  const discardClueTokenValue = getDiscardClueTokenValue(variant);
  const suitCompleteClueTokenValue = getSuitCompleteClueTokenValue(variant);
  const unadjustedClueTokens = getUnadjustedClueTokens(
    gameState.clueTokens,
    variant,
  );
  statsState.cluesStillUsable = getCluesStillUsable(
    score,
    scorePerStack,
    statsState.maxScorePerStack,
    variant.stackSize,
    gameState.cardsRemainingInTheDeck,
    numEndGameTurns,
    discardClueTokenValue,
    suitCompleteClueTokenValue,
    unadjustedClueTokens,
  );
  statsState.cluesStillUsableNotRounded = getCluesStillUsableNotRounded(
    score,
    scorePerStack,
    statsState.maxScorePerStack,
    variant.stackSize,
    gameState.cardsRemainingInTheDeck,
    numEndGameTurns,
    discardClueTokenValue,
    suitCompleteClueTokenValue,
    unadjustedClueTokens,
  );

  // Check if final round has effectively started because it is guaranteed to start in a fixed
  // number of turns.
  statsState.finalRoundEffectivelyStarted =
    gameState.cardsRemainingInTheDeck <= 0 ||
    statsState.cluesStillUsable === null ||
    statsState.cluesStillUsable < 1;

  // Handle double discard calculation.
  if (action.type === "discard") {
    statsState.doubleDiscardCard = getDoubleDiscardCard(
      action.order,
      gameState,
      variant,
    );
  } else if (action.type === "play" || action.type === "clue") {
    statsState.doubleDiscardCard = null;
  }

  // Handle `numSubsequentBlindPlays`.
  if (isBlindPlay(action, gameState, variant)) {
    statsState.numSubsequentBlindPlays++;
  } else if (isOneOfThreeMainActions(action)) {
    statsState.numSubsequentBlindPlays = 0;
  }

  // Handle `numSubsequentMisplays`.
  if (action.type === "discard" && action.failed) {
    statsState.numSubsequentMisplays++;
  } else if (isOneOfThreeMainActions(action)) {
    statsState.numSubsequentMisplays = 0;
  }
}

function isBlindPlay(
  action: GameAction,
  gameState: GameState,
  variant: Variant,
): boolean {
  // In "Throw it in a Hole" variants, bombs should appear as successful plays.
  const possiblePlay =
    action.type === "play" ||
    (variant.throwItInAHole && action.type === "discard" && action.failed);

  if (!possiblePlay) {
    return false;
  }

  const cardState = gameState.deck[action.order];
  const cardClued = cardState !== undefined && isCardClued(cardState);

  return !cardClued;
}

/** Whether the action was a clue, a discard, or a play. */
function isOneOfThreeMainActions(action: GameAction) {
  return (
    action.type === "clue" ||
    action.type === "discard" ||
    action.type === "play"
  );
}
