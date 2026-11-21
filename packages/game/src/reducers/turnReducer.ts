/* eslint-disable no-param-reassign */

import { assertDefined } from "complete-common";
import type { Draft } from "immer";
import { produce } from "immer";
import type { GameMetadata } from "../interfaces/GameMetadata.ts";
import type { GameState } from "../interfaces/GameState.ts";
import type { TurnState } from "../interfaces/TurnState.ts";
import { isInitialDealFinished } from "../rules/deck.ts";
import { getEndTurn, getNextPlayerIndex } from "../rules/turn.ts";
import type { GameAction } from "../types/gameActions.ts";

export function turnReducer(
  turn: TurnState,
  action: GameAction,
  gameState: GameState,
  metadata: GameMetadata,
): TurnState {
  return produce(turn, (draft) => {
    turnReducerFunction(draft, action, gameState, metadata);
  });
}

function turnReducerFunction(
  turn: Draft<TurnState>,
  action: GameAction,
  gameState: GameState,
  metadata: GameMetadata,
) {
  switch (action.type) {
    case "play": {
      turn.cardsPlayedOrDiscardedThisTurn++;

      if (gameState.cardsRemainingInTheDeck === 0) {
        if (turn.segment !== undefined) {
          turn.segment++;
        }

        nextTurn(turn, gameState.cardsRemainingInTheDeck, metadata);
      }

      break;
    }

    case "discard":
    case "misplay": {
      turn.cardsPlayedOrDiscardedThisTurn++;

      if (gameState.cardsRemainingInTheDeck === 0) {
        if (turn.segment !== undefined) {
          turn.segment++;
        }

        nextTurn(turn, gameState.cardsRemainingInTheDeck, metadata);
      }

      break;
    }

    case "clue": {
      assertDefined(
        turn.segment,
        `A "${action.type}" action happened before all of the initial cards were dealt.`,
      );

      turn.segment++;
      nextTurn(turn, gameState.cardsRemainingInTheDeck, metadata);
      break;
    }

    case "draw": {
      if (turn.segment === undefined) {
        // If the initial deal is still going on.
        if (
          isInitialDealFinished(gameState.cardsRemainingInTheDeck, metadata)
        ) {
          turn.segment = 0;
        }
      } else if (turn.cardsPlayedOrDiscardedThisTurn > 0) {
        // The turn ends when a card is drawn after a play or a discard. A draw of the final card of
        // the deck to perform a bottom-deck blind-play comes before the play, so it does not.
        turn.segment++;
        nextTurn(turn, gameState.cardsRemainingInTheDeck, metadata);
      }

      break;
    }

    case "gameOver": {
      assertDefined(
        turn.segment,
        `A "${action.type}" action happened before all of the initial cards were dealt.`,
      );

      // Setting the current player index to undefined signifies that the game is over and will
      // prevent any name frames from being highlighted on subsequent segments.
      turn.currentPlayerIndex = undefined;

      // For some types of game overs, we want the explanation text to appear on its own replay
      // segment. The types of "gameOver" that do not have to do with the previous action should be
      // on their own separate replay segment. Otherwise, we want the "gameOver" explanation to be
      // on the same segment as the final action. Any new end conditions must also be updated in the
      // "shouldStoreSegment()" function in "stateReducer.ts".
      if (
        action.endCondition === "timeout"
        || action.endCondition === "terminatedByPlayer"
        || action.endCondition === "terminatedByVote"
        || action.endCondition === "idleTimeout"
      ) {
        turn.segment++;
      }

      break;
    }

    case "playerTimes": {
      assertDefined(
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
  metadata: GameMetadata,
) {
  state.turnNum++;
  state.currentPlayerIndex = getNextPlayerIndex(
    state.currentPlayerIndex,
    metadata.options.numPlayers,
  );

  if (deckSize === 0 && state.endTurnNum === undefined) {
    state.endTurnNum = getEndTurn(state.turnNum, metadata);
  }

  state.cardsPlayedOrDiscardedThisTurn = 0;
}
