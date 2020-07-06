import produce, { Draft } from 'immer';
import * as turnRules from '../rules/turn';
import { GameAction } from '../types/actions';
import GameMetadata from '../types/GameMetadata';
import TurnState from '../types/TurnState';

const turnReducer = produce((
  state: Draft<TurnState>,
  action: GameAction,
  metadata: GameMetadata,
  deckSize: number,
  clueTokens: number,
) => {
  const numPlayers = metadata.options.numPlayers;
  const characterID = metadata.characterAssignments[state.currentPlayerIndex];

  switch (action.type) {
    case 'play':
    case 'discard': {
      state.cardsPlayedOrDiscardedThisTurn += 1;

      if (deckSize === 0) {
        nextTurn(state, numPlayers, characterID);
      }

      break;
    }

    case 'clue': {
      if (turnRules.shouldEndTurnAfterClue(state.cluesGivenThisTurn, characterID)) {
        nextTurn(state, numPlayers, characterID);
      }
      break;
    }

    case 'draw': {
      if (turnRules.shouldEndTurnAfterDraw(
        state.cardsPlayedOrDiscardedThisTurn,
        characterID,
        clueTokens,
      )) {
        nextTurn(state, numPlayers, characterID);
      }
      break;
    }

    // It is now a new turn
    // {num: 0, type: "turn", who: 1}
    case 'turn': {
      // TEMP: At this point, check that the local state matches the server
      if (state.turn !== action.num) {
        console.warn('The turns from the client and the server do not match. '
            + `Client = ${state.turn}, Server = ${action.num}`);
      }

      // TEMP: the client should set the "currentPlayerIndex" index to -1 when the game is over
      // But it does not have logic to know when the game is over yet
      if (action.who === -1) {
        state.currentPlayerIndex = -1;
      }

      if (state.currentPlayerIndex !== action.who) {
        // TODO
        console.warn('The currentPlayerIndex from the client and the server do not match. '
            + `Client = ${state.currentPlayerIndex}, Server = ${action.who}`);
      }
      break;
    }

    default: {
      break;
    }
  }
}, {} as TurnState);

export default turnReducer;

function nextTurn(state: Draft<TurnState>, numPlayers: number, characterID: number) {
  state.turn += 1;
  if (turnRules.shouldTurnsInvert(characterID)) {
    state.turnsInverted = !state.turnsInverted;
  }
  state.currentPlayerIndex = turnRules.getNextPlayerIndex(
    state.currentPlayerIndex,
    numPlayers,
    state.turnsInverted,
  );
  state.cardsPlayedOrDiscardedThisTurn = 0;
}
