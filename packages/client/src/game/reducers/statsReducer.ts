// Functions for calculating running statistics such as efficiency and pace as a result of each
// action.

import { getVariant } from "@hanabi/data";
import type { GameMetadata, GameState, StatsState } from "@hanabi/game";
import type { Draft } from "immer";
import { produce } from "immer";
import { sumArray } from "isaacscript-common-ts";
import * as cardRules from "../rules/card";
import * as clueTokensRules from "../rules/clueTokens";
import * as statsRules from "../rules/stats";
import * as turnRules from "../rules/turn";
import type { CardNote } from "../types/CardNote";
import type { GameAction } from "../types/actions";

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
        const playStack = gameState.playStacks[action.suitIndex];

        if (
          playStack !== undefined &&
          playStack.length === variant.stackSize &&
          previousGameState.clueTokens === gameState.clueTokens &&
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
  statsState.pace = statsRules.getPace(
    score,
    gameState.cardsRemainingInTheDeck,
    statsState.maxScore,
    numEndGameTurns,
    // `currentPlayerIndex` will be null if the game is over.
    gameState.turn.currentPlayerIndex === null,
  );
  statsState.paceRisk = statsRules.getPaceRisk(
    statsState.pace,
    metadata.options.numPlayers,
  );

  // Handle efficiency calculation.
  statsState.cardsGotten = statsRules.getCardsGotten(
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
      : statsRules.getCardsGottenByNotes(
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
  statsState.cluesStillUsable = statsRules.getCluesStillUsable(
    score,
    scorePerStack,
    statsState.maxScorePerStack,
    variant.stackSize,
    gameState.cardsRemainingInTheDeck,
    numEndGameTurns,
    clueTokensRules.discardValue(variant),
    clueTokensRules.suitValue(variant),
    clueTokensRules.getUnadjusted(gameState.clueTokens, variant),
  );
  statsState.cluesStillUsableNotRounded =
    statsRules.getCluesStillUsableNotRounded(
      score,
      scorePerStack,
      statsState.maxScorePerStack,
      variant.stackSize,
      gameState.cardsRemainingInTheDeck,
      numEndGameTurns,
      clueTokensRules.discardValue(variant),
      clueTokensRules.suitValue(variant),
      clueTokensRules.getUnadjusted(gameState.clueTokens, variant),
    );

  // Check if final round has effectively started because it is guaranteed to start in a fixed
  // number of turns.
  statsState.finalRoundEffectivelyStarted =
    gameState.cardsRemainingInTheDeck <= 0 ||
    statsState.cluesStillUsable === null ||
    statsState.cluesStillUsable < 1;

  // Handle double discard calculation.
  if (action.type === "discard") {
    statsState.doubleDiscardCard = statsRules.getDoubleDiscardCard(
      action.order,
      gameState,
      variant,
    );
  } else if (action.type === "play" || action.type === "clue") {
    statsState.doubleDiscardCard = null;
  }

  // Handle `numSubsequentBlindPlays`.
  if (isBlindPlay(action, gameState)) {
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

function isBlindPlay(action: GameAction, gameState: GameState): boolean {
  if (action.type !== "play") {
    return false;
  }

  const card = gameState.deck[action.order];
  const cardClued = card !== undefined && cardRules.isCardClued(card);

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
