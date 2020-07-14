import produce, { Draft } from 'immer';
import { deckRules } from '../rules';
import * as turnRules from '../rules/turn';
import { GameAction } from '../types/actions';
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
    case 'play':
    case 'discard': {
      turn.cardsPlayedOrDiscardedThisTurn += 1;

      if (currentState.deckSize === 0) {
        turn.gameSegment! += 1;
        nextTurn(turn, numPlayers, currentState.deckSize, characterID);
      }

      break;
    }

    case 'clue': {
      if (turn.gameSegment === null) {
        throw new Error(`A "${action.type}" action happened before all of the initial cards were dealt.`);
      }
      turn.gameSegment += 1;

      if (turnRules.shouldEndTurnAfterClue(turn.cluesGivenThisTurn, characterID)) {
        nextTurn(turn, numPlayers, currentState.deckSize, characterID);
      }
      break;
    }

    case 'draw': {
      if (turn.gameSegment === null) { // If the initial deal is still going on
        if (deckRules.isInitialDealFinished(currentState.deckSize, metadata)) {
          turn.gameSegment = 0;
        }
      } else {
        turn.gameSegment += 1;

        if (turnRules.shouldEndTurnAfterDraw(
          turn.cardsPlayedOrDiscardedThisTurn,
          characterID,
          currentState.clueTokens,
        )) {
          nextTurn(turn, numPlayers, currentState.deckSize, characterID);
        }
      }

      break;
    }

    case 'gameDuration': {
      // At the end of the game, the server will send us how much time each player finished with
      // as well as the total game duration; we want all of this text on its own replay segment to
      // avoid cluttering the final turn of the game
      if (turn.gameSegment === null) {
        throw new Error(`A "${action.type}" action happened before all of the initial cards were dealt.`);
      }
      turn.gameSegment += 1;
      break;
    }

    case 'gameOver': {
      if (turn.gameSegment === null) {
        throw new Error(`A "${action.type}" action happened before all of the initial cards were dealt.`);
      }
      turn.gameSegment += 1;
      turn.currentPlayerIndex = null;
      break;
    }

    // The current turn has ended and a new turn has begun
    // {type: 'turn', num: 0, currentPlayerIndex: 1}
    // TODO: This message is unnecessary and will be removed in a future version of the code
    case 'turn': {
      // TEMP: At this point, check that the local state matches the server
      if (turn.turnNum !== action.num && turn.currentPlayerIndex !== null) {
        // Ignore turns that occur after the game has already ended
        console.warn(`The turns from the client and the server do not match on turn ${turn.turnNum}.`);
        console.warn(`Client = ${turn.turnNum}, Server = ${action.num}`);
      }

      // TEMP: the client should set the "currentPlayerIndex" index to -1 when the game is over
      if (action.currentPlayerIndex === -1 && turn.currentPlayerIndex !== null) {
        turn.currentPlayerIndex = null;
        console.log('The "turnReducer()" function had to manually set the "currentPlayerIndex" to null.');
        // This condition will be triggered in Jest tests because the "loadGameJSON.ts" file does
        // not know how to properly create a "gameOver" action
      }

      if (
        turn.currentPlayerIndex !== action.currentPlayerIndex
        && turn.currentPlayerIndex !== null
      ) {
        console.warn(`The currentPlayerIndex from the client and the server do not match on turn ${turn.turnNum}.`);
        console.warn(`Client = ${turn.currentPlayerIndex}, Server = ${action.currentPlayerIndex}`);
      }
      break;
    }

    default: {
      break;
    }
  }
}, {} as TurnState);

export default turnReducer;

function nextTurn(
  state: Draft<TurnState>,
  numPlayers: number,
  deckSize: number,
  characterID: number | null,
) {
  state.turnNum += 1;

  state.currentPlayerIndex = turnRules.getNextPlayerIndex(
    state.currentPlayerIndex,
    numPlayers,
    state.playOrderInverted,
  );

  if (turnRules.shouldPlayOrderInvert(characterID)) {
    state.playOrderInverted = !state.playOrderInverted;
  }

  if (deckSize === 0 && state.endTurnNum === null) {
    state.endTurnNum = state.turnNum + numPlayers;
  }

  state.cardsPlayedOrDiscardedThisTurn = 0;
  state.cluesGivenThisTurn = 0;
}
