/* eslint-disable no-param-reassign */

import { assertNotNull } from "complete-common";
import type { Draft } from "immer";
import { produce } from "immer";
import { EndCondition } from "../enums/EndCondition";
import { getVariant } from "../gameData";
import type { GameMetadata } from "../interfaces/GameMetadata";
import type { GameState } from "../interfaces/GameState";
import type { TurnState } from "../interfaces/TurnState";
import { isInitialDealFinished } from "../rules/deck";
import {
  getEndTurn,
  getNextPlayerIndex,
  shouldEndTurnAfterClue,
  shouldEndTurnAfterDraw,
  shouldPlayOrderInvert,
} from "../rules/turn";
import type { GameAction } from "../types/gameActions";
import { getCharacterNameForPlayer } from "./reducerHelpers";

export const turnReducer = produce(turnReducerFunction, {} as TurnState);

function turnReducerFunction(
  turn: Draft<TurnState>,
  action: GameAction,
  gameState: GameState,
  metadata: GameMetadata,
) {
  const variant = getVariant(metadata.options.variantName);
  const characterName = getCharacterNameForPlayer(
    turn.currentPlayerIndex,
    metadata.characterAssignments,
  );

  switch (action.type) {
    case "play": {
      turn.cardsPlayedOrDiscardedThisTurn++;

      if (gameState.cardsRemainingInTheDeck === 0) {
        if (turn.segment !== null) {
          turn.segment++;
        }

        nextTurn(
          turn,
          gameState.cardsRemainingInTheDeck,
          characterName,
          metadata,
        );
      }

      break;
    }

    case "discard": {
      turn.cardsPlayedOrDiscardedThisTurn++;
      if (!action.failed) {
        turn.cardsDiscardedThisTurn++;
      }

      if (gameState.cardsRemainingInTheDeck === 0) {
        if (turn.segment !== null) {
          turn.segment++;
        }

        if (
          shouldEndTurnAfterDraw(
            turn.cardsPlayedOrDiscardedThisTurn,
            turn.cardsDiscardedThisTurn,
            characterName,
            gameState.clueTokens,
            variant,
          )
        ) {
          nextTurn(
            turn,
            gameState.cardsRemainingInTheDeck,
            characterName,
            metadata,
          );
        }
      }

      break;
    }

    case "clue": {
      turn.cluesGivenThisTurn++;

      assertNotNull(
        turn.segment,
        `A "${action.type}" action happened before all of the initial cards were dealt.`,
      );

      turn.segment++;

      if (shouldEndTurnAfterClue(turn.cluesGivenThisTurn, characterName)) {
        nextTurn(
          turn,
          gameState.cardsRemainingInTheDeck,
          characterName,
          metadata,
        );
      }
      break;
    }

    case "draw": {
      if (turn.segment === null) {
        // If the initial deal is still going on.
        if (
          isInitialDealFinished(gameState.cardsRemainingInTheDeck, metadata)
        ) {
          turn.segment = 0;
        }
      } else {
        // We do not want to increment the segment if we are drawing the final card of the deck in
        // order to perform a bottom-deck blind-play.
        if (turn.cardsPlayedOrDiscardedThisTurn > 0) {
          turn.segment++;
        }

        if (
          shouldEndTurnAfterDraw(
            turn.cardsPlayedOrDiscardedThisTurn,
            turn.cardsDiscardedThisTurn,
            characterName,
            gameState.clueTokens,
            variant,
          )
        ) {
          nextTurn(
            turn,
            gameState.cardsRemainingInTheDeck,
            characterName,
            metadata,
          );
        }
      }

      break;
    }

    case "gameOver": {
      assertNotNull(
        turn.segment,
        `A "${action.type}" action happened before all of the initial cards were dealt.`,
      );

      // Setting the current player index to null signifies that the game is over and will prevent
      // any name frames from being highlighted on subsequent segments.
      turn.currentPlayerIndex = null; // eslint-disable-line unicorn/no-null

      // For some types of game overs, we want the explanation text to appear on its own replay
      // segment. The types of "gameOver" that do not have to do with the previous action should be
      // on their own separate replay segment. Otherwise, we want the "gameOver" explanation to be
      // on the same segment as the final action. Any new end conditions must also be updated in the
      // "shouldStoreSegment()" function in "stateReducer.ts".
      if (
        action.endCondition === EndCondition.Timeout
        || action.endCondition === EndCondition.TerminatedByPlayer
        || action.endCondition === EndCondition.TerminatedByVote
        || action.endCondition === EndCondition.IdleTimeout
      ) {
        turn.segment++;
      }

      break;
    }

    case "playerTimes": {
      assertNotNull(
        turn.segment,
        `A "${action.type}" action happened before all of the initial cards were dealt.`,
      );

      // At the end of the game, the server will send us how much time each player finished with as
      // well as the total game duration; we want all of this text on its own replay segment to
      // avoid cluttering the final turn of the game.
      turn.segment++;
      break;
    }

    default: {
      break;
    }
  }
}

function nextTurn(
  state: Draft<TurnState>,
  deckSize: number,
  characterName: string,
  metadata: GameMetadata,
) {
  state.turnNum++;

  if (shouldPlayOrderInvert(characterName)) {
    state.playOrderInverted = !state.playOrderInverted;
  }

  state.currentPlayerIndex = getNextPlayerIndex(
    state.currentPlayerIndex,
    metadata.options.numPlayers,
    state.playOrderInverted,
  );

  if (deckSize === 0 && state.endTurnNum === null) {
    state.endTurnNum = getEndTurn(state.turnNum, metadata);
  }

  state.cardsPlayedOrDiscardedThisTurn = 0;
  state.cardsDiscardedThisTurn = 0;
  state.cluesGivenThisTurn = 0;
}
