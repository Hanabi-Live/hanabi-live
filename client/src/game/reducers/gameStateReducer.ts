// Functions for building a state table for every turn
// (state tables are currently unused but eventually the client will eventually be rewritten to
// handle state transitions)

import produce, { Draft, original, current } from 'immer';
import { ensureAllCases } from '../../misc';
import { VARIANTS } from '../data/gameData';
import * as clues from '../rules/clues';
import { GameAction } from '../types/actions';
import GameState from '../types/GameState';
import statsReducer from './statsReducer';

const gameStateReducer = produce((state: Draft<GameState>, action: GameAction) => {
  // Shorthand since the variant is often passed as a parameter
  const v = VARIANTS.get(state.variantName)!;
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

      const hand = state.hands[action.target];
      if (!hand) {
        console.error(`Failed to get "state.hands[]" with an index of ${action.target}.`);
        break;
      }
      for (const order of hand) {
        const card = state.deck[order];
        card.clues.push({
          type: action.clue.type,
          value: action.clue.value,
          positive: action.list.includes(order),
        });
      }

      incrementTurn(state);
      break;
    }

    // A player just discarded a card
    // {failed: false, type: "discard", which: {index: 0, order: 4, rank: 1, suit: 2}}
    case 'discard': {
      // Reveal all cards discarded
      const card = state.deck[action.which.order];
      if (!card) {
        console.error(`Failed to get the card for index ${action.which.order}.`);
        break;
      }
      card.suit = action.which.suit;
      card.rank = action.which.rank;

      // Remove it from the hand
      const hand = state.hands[action.which.index];
      const handIndex = hand.indexOf(action.which.order);
      if (handIndex !== -1) {
        hand.splice(handIndex, 1);
      }

      // Add it to the discard stacks
      state.discardStacks[card.suit].push(action.which.order);

      if (!action.failed) {
        state.clueTokens = clues.gainClue(v, state.clueTokens);
      }

      incrementTurn(state);
      break;
    }

    // A player just drew a card from the deck
    // {order: 0, rank: 1, suit: 4, type: "draw", who: 0}
    case 'draw': {
      state.deckSize -= 1;
      state.deck[action.order] = {
        suit: action.suit,
        rank: action.rank,
        clues: [],
      };
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
      // Reveal all cards played
      const card = state.deck[action.which.order];
      if (!card) {
        console.error(`Failed to get the card for index ${action.which.order}.`);
        break;
      }
      card.suit = action.which.suit;
      card.rank = action.which.rank;

      // Remove it from the hand
      const hand = state.hands[action.which.index];
      const handIndex = hand.indexOf(action.which.order);
      if (handIndex !== -1) {
        hand.splice(handIndex, 1);
      }

      // Add it to the play stacks
      state.playStacks[card.suit].push(action.which.order);

      // Gain a point
      state.score += 1;

      // Gain a clue token if the stack is complete
      if (state.playStacks[card.suit].length === 5) {
        state.clueTokens = clues.gainClue(v, state.clueTokens);
      }

      incrementTurn(state);
      break;
    }

    // An action has been taken, so there may be a change to game state variables
    // {clues: 5, doubleDiscard: false, maxScore: 24, score: 18, type: "status"}
    case 'status': {
      // TODO: calculate doubleDiscard instead of using the server value
      state.doubleDiscard = action.doubleDiscard;

      // TEMP: At this point, check that the local state matches the server
      if (action.score !== state.score) {
        console.warn('The scores from client and server don\'t match. '
            + `Client = ${state.score}, Server = ${action.score}`);
      }

      if (action.clues !== state.clueTokens) {
        console.warn('The clues from client and server don\'t match. '
            + `Client = ${state.clueTokens}, Server = ${action.clues}`);
      }

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

    // It is now a new turn
    // {num: 0, type: "turn", who: 1}
    case 'turn': {
      // TODO: Remove this block
      break;
    }

    case 'stackDirections':
    case 'reorder':
    case 'deckOrder': {
      break;
    }

    default: {
      ensureAllCases(action);
      break;
    }
  }

  // Calculate the stats for this turn
  state.stats = statsReducer(original(state.stats), action, original(state)!, current(state));
}, {} as GameState);

const incrementTurn = (state: Draft<GameState>) => {
  state.turn += 1;
  state.currentPlayerIndex += 1;
  state.currentPlayerIndex %= state.hands.length;
};

export default gameStateReducer;
