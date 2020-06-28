// Functions for building a state table for every turn

import produce, {
  Draft, original, current,
} from 'immer';
import { ensureAllCases } from '../../misc';
import { VARIANTS } from '../data/gameData';
import * as clues from '../rules/clues';
import { GameAction } from '../types/actions';
import GameState from '../types/GameState';
import Options from '../types/Options';
import TurnState from '../types/TurnState';
import cardsReducer from './cardsReducer';
import statsReducer from './statsReducer';
import turnReducer from './turnReducer';

const gameStateReducer = produce((
  state: Draft<GameState>,
  action: GameAction,
  options: Options,
) => {
  const variant = VARIANTS.get(options.variantName);
  if (variant === undefined) {
    throw new Error(`Unable to find the "${options.variantName}" variant in the "VARIANTS" map.`);
  }

  switch (action.type) {
    // A player just gave a clue
    // {clue: {type: 0, value: 1}, giver: 1, list: [11], target: 2, turn: 0, type: "clue"}
    case 'clue': {
      state.clueTokens -= 1;
      state.clues.push({
        type: action.clue.type,
        value: action.clue.value,
        giver: action.giver,
        target: action.target,
        turn: action.turn,
      });

      break;
    }

    // A player just discarded a card
    // {failed: false, type: "discard", which: {index: 0, order: 4, rank: 1, suit: 2}}
    case 'discard': {
      // Remove it from the hand
      const hand = state.hands[action.which.index];
      const handIndex = hand.indexOf(action.which.order);
      if (handIndex !== -1) {
        hand.splice(handIndex, 1);
      }

      // Add it to the discard stacks
      state.discardStacks[action.which.suit].push(action.which.order);

      if (!action.failed) {
        state.clueTokens = clues.gainClue(variant, state.clueTokens);
      }

      break;
    }

    // A player just drew a card from the deck
    // {order: 0, rank: 1, suit: 4, type: "draw", who: 0}
    case 'draw': {
      state.deckSize -= 1;
      const hand = state.hands[action.who];
      if (hand) {
        hand.push(action.order);
      }

      break;
    }

    // A player just played a card
    // {type: "play", which: {index: 0, order: 4, rank: 1, suit: 2}}
    // (index is the player index)
    case 'play': {
      // Remove it from the hand
      const hand = state.hands[action.which.index];
      const handIndex = hand.indexOf(action.which.order);
      if (handIndex !== -1) {
        hand.splice(handIndex, 1);
      }

      // Add it to the play stacks
      state.playStacks[action.which.suit].push(action.which.order);

      // Gain a point
      state.score += 1;

      // Gain a clue token if the stack is complete
      if (state.playStacks[action.which.suit].length === 5) { // Hard-code 5 cards per stack
        state.clueTokens = clues.gainClue(variant, state.clueTokens);
      }

      break;
    }

    // An action has been taken, so there may be a change to game state variables
    // {clues: 5, doubleDiscard: false, maxScore: 24, score: 18, type: "status"}
    case 'status': {
      // TEMP: At this point, check that the local state matches the server
      if (state.clueTokens !== action.clues) {
        console.warn('The clues from the client and the server do not match. '
            + `Client = ${state.clueTokens}, Server = ${action.clues}`);
      }

      // TEMP: At this point, check that the local state matches the server
      if (state.score !== action.score) {
        console.warn('The scores from the client and the server do not match. '
            + `Client = ${state.score}, Server = ${action.score}`);
      }

      // TODO: calculate maxScore instead of using the server one
      state.maxScore = action.maxScore;

      // TODO: calculate doubleDiscard instead of using the server value
      state.doubleDiscard = action.doubleDiscard;

      break;
    }

    // A player failed to play a card
    // {num: 1, order: 24, turn: 32, type: "strike"}
    case 'strike': {
      state.strikes.push({
        order: action.order,
        turn: action.turn,
      });
      break;
    }

    // A line of text was received from the server
    // {text: "Alice plays Red 2 from slot #1", type: "text"}
    case 'text': {
      state.log.push(action.text);
      break;
    }

    case 'turn':
    case 'stackDirections':
    case 'reorder':
    case 'deckOrder': {
      // Actions that don't affect the main state
      // or are handled by another reducer
      break;
    }

    default: {
      ensureAllCases(action);
      break;
    }
  }

  // Use a sub-reducer to calculate changes on cards
  state.deck = cardsReducer(
    original(state.deck),
    action,
    current(state.hands),
    options,
  );

  // Use a sub-reducer to calculate the turn
  let turnState: TurnState = {
    turn: state.turn,
    currentPlayerIndex: state.currentPlayerIndex,
  };
  turnState = turnReducer(turnState, action, options.numPlayers);
  state.turn = turnState.turn;
  state.currentPlayerIndex = turnState.currentPlayerIndex;

  // Use a sub-reducer to calculate some game statistics
  state.stats = statsReducer(
    original(state.stats),
    action,
    original(state)!,
    current(state),
    options,
  );
}, {} as GameState);

export default gameStateReducer;
