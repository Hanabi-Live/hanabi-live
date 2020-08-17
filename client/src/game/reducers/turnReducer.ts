import produce, { Draft } from 'immer';
import { deckRules } from '../rules';
import * as turnRules from '../rules/turn';
import { GameAction } from '../types/actions';
import EndCondition from '../types/EndCondition';
import GameMetadata from '../types/GameMetadata';
import GameState from '../types/GameState';
import TurnState from '../types/TurnState';
import { getCharacterIDForPlayer } from './reducerHelpers';

const turnReducer = produce((
  turn: Draft<TurnState>,
  action: GameAction,
  currentState: GameState,
  metadata: GameMetadata,
) => {
  const numPlayers = metadata.options.numPlayers;
  const characterID = getCharacterIDForPlayer(
    turn.currentPlayerIndex,
    metadata.characterAssignments,
  );

  switch (action.type) {
    case 'play': {
      turn.cardsPlayedOrDiscardedThisTurn += 1;

      if (currentState.cardsRemainingInTheDeck === 0) {
        turn.segment! += 1;
        nextTurn(turn, numPlayers, currentState.cardsRemainingInTheDeck, characterID);
      }

      break;
    }

    case 'discard': {
      turn.cardsPlayedOrDiscardedThisTurn += 1;
      turn.cardsDiscardedThisTurn += 1;

      if (currentState.cardsRemainingInTheDeck === 0) {
        turn.segment! += 1;
        nextTurn(turn, numPlayers, currentState.cardsRemainingInTheDeck, characterID);
      }

      break;
    }

    case 'clue': {
      turn.cluesGivenThisTurn += 1;

      if (turn.segment === null) {
        throw new Error(`A "${action.type}" action happened before all of the initial cards were dealt.`);
      }
      turn.segment += 1;

      if (turnRules.shouldEndTurnAfterClue(turn.cluesGivenThisTurn, characterID)) {
        nextTurn(turn, numPlayers, currentState.cardsRemainingInTheDeck, characterID);
      }
      break;
    }

    case 'draw': {
      if (turn.segment === null) { // If the initial deal is still going on
        if (deckRules.isInitialDealFinished(currentState.cardsRemainingInTheDeck, metadata)) {
          turn.segment = 0;
        }
      } else {
        // We do not want to increment the segment if we are drawing the final card of the deck in
        // order to perform a bottom-deck blind-play
        if (turn.cardsPlayedOrDiscardedThisTurn > 0) {
          turn.segment += 1;
        }

        if (turnRules.shouldEndTurnAfterDraw(
          turn.cardsPlayedOrDiscardedThisTurn,
          turn.cardsDiscardedThisTurn,
          characterID,
          currentState.clueTokens,
        )) {
          nextTurn(turn, numPlayers, currentState.cardsRemainingInTheDeck, characterID);
        }
      }

      break;
    }

    case 'gameOver': {
      if (turn.segment === null) {
        throw new Error(`A "${action.type}" action happened before all of the initial cards were dealt.`);
      }

      // Setting the current player index to null signifies that the game is over and will prevent
      // any name frames from being highlighted on subsequent segments
      turn.currentPlayerIndex = null;

      // For some types of game overs,
      // we want the explanation text to appear on its own replay segment
      // The types of "gameOver" that do not have to do with the previous action should be on
      // their own separate replay segment
      // Otherwise, we want the "gameOver" explanation to be on the same segment as the final action
      // Any new end conditions must also be updated in the "shouldStoreSegment()" function in
      // "stateReducer.ts"
      if (
        action.endCondition === EndCondition.Timeout
        || action.endCondition === EndCondition.Terminated
        || action.endCondition === EndCondition.IdleTimeout
      ) {
        turn.segment += 1;
      }

      break;
    }

    case 'playerTimes': {
      if (turn.segment === null) {
        throw new Error(`A "${action.type}" action happened before all of the initial cards were dealt.`);
      }

      // At the end of the game, the server will send us how much time each player finished with
      // as well as the total game duration; we want all of this text on its own replay segment to
      // avoid cluttering the final turn of the game
      turn.segment += 1;
      break;
    }

    default: {
      break;
    }
  }
}, {} as TurnState);

export default turnReducer;

const nextTurn = (
  state: Draft<TurnState>,
  numPlayers: number,
  deckSize: number,
  characterID: number | null,
) => {
  state.turnNum += 1;

  if (turnRules.shouldPlayOrderInvert(characterID)) {
    state.playOrderInverted = !state.playOrderInverted;
  }

  state.currentPlayerIndex = turnRules.getNextPlayerIndex(
    state.currentPlayerIndex,
    numPlayers,
    state.playOrderInverted,
  );

  if (deckSize === 0 && state.endTurnNum === null) {
    state.endTurnNum = state.turnNum + numPlayers;
  }

  state.cardsPlayedOrDiscardedThisTurn = 0;
  state.cardsDiscardedThisTurn = 0;
  state.cluesGivenThisTurn = 0;
};
