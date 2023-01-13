import { getVariant } from "@hanabi/data";
import produce, { Draft } from "immer";
import * as deckRules from "../rules/deck";
import * as turnRules from "../rules/turn";
import { GameAction } from "../types/actions";
import { EndCondition } from "../types/EndCondition";
import { GameMetadata } from "../types/GameMetadata";
import { GameState } from "../types/GameState";
import { TurnState } from "../types/TurnState";
import { getCharacterNameForPlayer } from "./reducerHelpers";

export const turnReducer = produce(turnReducerFunction, {} as TurnState);

function turnReducerFunction(
  turn: Draft<TurnState>,
  action: GameAction,
  currentState: GameState,
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

      if (currentState.cardsRemainingInTheDeck === 0) {
        turn.segment!++;
        nextTurn(
          turn,
          currentState.cardsRemainingInTheDeck,
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

      if (currentState.cardsRemainingInTheDeck === 0) {
        turn.segment!++;
        if (
          turnRules.shouldEndTurnAfterDraw(
            turn.cardsPlayedOrDiscardedThisTurn,
            turn.cardsDiscardedThisTurn,
            characterName,
            currentState.clueTokens,
            variant,
          )
        ) {
          nextTurn(
            turn,
            currentState.cardsRemainingInTheDeck,
            characterName,
            metadata,
          );
        }
      }

      break;
    }

    case "clue": {
      turn.cluesGivenThisTurn++;

      if (turn.segment === null) {
        throw new Error(
          `A "${action.type}" action happened before all of the initial cards were dealt.`,
        );
      }
      turn.segment++;

      if (
        turnRules.shouldEndTurnAfterClue(turn.cluesGivenThisTurn, characterName)
      ) {
        nextTurn(
          turn,
          currentState.cardsRemainingInTheDeck,
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
          deckRules.isInitialDealFinished(
            currentState.cardsRemainingInTheDeck,
            metadata,
          )
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
          turnRules.shouldEndTurnAfterDraw(
            turn.cardsPlayedOrDiscardedThisTurn,
            turn.cardsDiscardedThisTurn,
            characterName,
            currentState.clueTokens,
            variant,
          )
        ) {
          nextTurn(
            turn,
            currentState.cardsRemainingInTheDeck,
            characterName,
            metadata,
          );
        }
      }

      break;
    }

    case "gameOver": {
      if (turn.segment === null) {
        throw new Error(
          `A "${action.type}" action happened before all of the initial cards were dealt.`,
        );
      }

      // Setting the current player index to null signifies that the game is over and will prevent
      // any name frames from being highlighted on subsequent segments.
      turn.currentPlayerIndex = null;

      // For some types of game overs, we want the explanation text to appear on its own replay
      // segment. The types of "gameOver" that do not have to do with the previous action should be
      // on their own separate replay segment. Otherwise, we want the "gameOver" explanation to be
      // on the same segment as the final action. Any new end conditions must also be updated in the
      // "shouldStoreSegment()" function in "stateReducer.ts".
      if (
        action.endCondition === EndCondition.Timeout ||
        action.endCondition === EndCondition.Terminated ||
        action.endCondition === EndCondition.VotedToKill ||
        action.endCondition === EndCondition.IdleTimeout
      ) {
        turn.segment++;
      }

      break;
    }

    case "playerTimes": {
      if (turn.segment === null) {
        throw new Error(
          `A "${action.type}" action happened before all of the initial cards were dealt.`,
        );
      }

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

  if (turnRules.shouldPlayOrderInvert(characterName)) {
    state.playOrderInverted = !state.playOrderInverted;
  }

  state.currentPlayerIndex = turnRules.getNextPlayerIndex(
    state.currentPlayerIndex,
    metadata.options.numPlayers,
    state.playOrderInverted,
  );

  if (deckSize === 0 && state.endTurnNum === null) {
    state.endTurnNum = turnRules.getEndTurn(state.turnNum, metadata);
  }

  state.cardsPlayedOrDiscardedThisTurn = 0;
  state.cardsDiscardedThisTurn = 0;
  state.cluesGivenThisTurn = 0;
}
