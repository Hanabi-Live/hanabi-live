// Functions for building a state table for every turn
// (state tables are currently unused but eventually the client will eventually be rewritten to
// handle state transitions)

// Imports
import * as _ from 'lodash';
import { MAX_CLUE_NUM } from '../../constants';
import {
  ActionClue,
  ActionDeckOrder,
  ActionDiscard,
  ActionDraw,
  ActionPlay,
  ActionStatus,
  ActionStrike,
  ActionText,
  ActionTurn,
} from './actions';
import globals from './globals';
import { ActionIncludingHypothetical } from './hypothetical';
import State from './State';

// Define a command handler map
type StateChangeFunction = (prev: State, data: any) => State;
const stateChangeFunctions = new Map<ActionIncludingHypothetical['type'], StateChangeFunction>();
export default stateChangeFunctions;

// A player just gave a clue
// {clue: {type: 0, value: 1}, giver: 1, list: [11], target: 2, turn: 0, type: "clue"}
stateChangeFunctions.set('clue', (prev: State, data: ActionClue) => {
  const state = _.cloneDeep(prev);
  state.clueTokens -= 1;
  state.clues.push({
    type: data.clue.type,
    value: data.clue.value,
    giver: data.giver,
    target: data.target,
    turn: data.turn,
  });

  const hand = state.hands[data.target];
  if (hand) {
    for (const order of hand) {
      const card = state.deck[order];
      card.clues.push({
        type: data.clue.type,
        value: data.clue.value,
        positive: data.list.includes(order),
      });
    }
  } else {
    console.error(`Failed to get "state.hands[]" with an index of ${data.target}.`);
    return state;
  }

  return state;
});

// The game is over and the server gave us a list of every card in the deck
// {deck: [{suit: 0, rank: 1}, {suit: 2, rank: 2}, ...], type: "deckOrder", }
stateChangeFunctions.set('deckOrder', (prev: State, data: ActionDeckOrder) => {
  globals.deckOrder = data.deck;
  // TODO: remove this function, since it doesn't affect state
  return prev;
});

// A player just discarded a card
// {failed: false, type: "discard", which: {index: 0, order: 4, rank: 1, suit: 2}}
stateChangeFunctions.set('discard', (prev: State, data: ActionDiscard) => {
  const state = _.cloneDeep(prev);

  // Reveal all cards discarded
  const card = state.deck[data.which.order];
  if (!card) {
    console.error(`Failed to get the card for index ${data.which.order}.`);
    return state;
  }
  card.suit = data.which.suit;
  card.rank = data.which.rank;

  // Remove it from the hand
  const hand = state.hands[data.which.index];
  const handIndex = hand.indexOf(data.which.order);
  if (handIndex !== -1) {
    hand.splice(handIndex, 1);
  }

  // Add it to the discard stacks
  state.discardStacks[card.suit].push(data.which.order);

  if (!data.failed) {
    state.clueTokens = gainClue(state.clueTokens);
  }

  return state;
});

// A player just drew a card from the deck
// {order: 0, rank: 1, suit: 4, type: "draw", who: 0}
stateChangeFunctions.set('draw', (prev: State, data: ActionDraw) => {
  const state = _.cloneDeep(prev);
  state.deckSize -= 1;
  state.deck[data.order] = {
    suit: data.suit,
    rank: data.rank,
    clues: [],
  };
  const hand = state.hands[data.who];
  if (hand) {
    hand.push(data.order);
  }

  return state;
});

// A player just played a card
// {type: "play", which: {index: 0, order: 4, rank: 1, suit: 2}}
// (index is the player index)
stateChangeFunctions.set('play', (prev: State, data: ActionPlay) => {
  const state = _.cloneDeep(prev);

  // Reveal all cards played
  const card = state.deck[data.which.order];
  if (!card) {
    console.error(`Failed to get the card for index ${data.which.order}.`);
    return state;
  }
  card.suit = data.which.suit;
  card.rank = data.which.rank;

  // Remove it from the hand
  const hand = state.hands[data.which.index];
  const handIndex = hand.indexOf(data.which.order);
  if (handIndex !== -1) {
    hand.splice(handIndex, 1);
  }

  // Add it to the play stacks
  state.playStacks[card.suit].push(data.which.order);

  // Get points
  state.score += 1;

  // Get clues if the stack is complete
  if (state.playStacks[card.suit].length === 5) {
    state.clueTokens = gainClue(state.clueTokens);
  }

  return state;
});

// An action has been taken, so there may be a change to game state variables
// {clues: 5, doubleDiscard: false, maxScore: 24, score: 18, type: "status"}
stateChangeFunctions.set('status', (prev: State, data: ActionStatus) => {
  const state = _.clone(prev);

  state.doubleDiscard = data.doubleDiscard;
  state.maxScore = data.maxScore;

  // TEMP: At this point, check the local state matches the server
  if (data.score !== state.score) {
    console.warn('The scores from client and server don\'t match. '
    + `Client = ${state.score}, Server = ${data.score}`);
  }

  if (data.clues !== state.clueTokens) {
    console.warn('The clues from client and server don\'t match. '
    + `Client = ${state.clueTokens}, Server = ${data.clues}`);
  }

  return state;
});

// A player failed to play a card
// {num: 1, order: 24, turn: 32, type: "strike"}
stateChangeFunctions.set('strike', (prev: State, data: ActionStrike) => {
  const state = _.clone(prev);
  state.strikes = [...prev.strikes, {
    order: data.order,
    turn: data.turn,
  }];
  return state;
});

// A line of text was recieved from the server
// {text: "Razgovor plays Black 2 from slot #1", type: "text"}
stateChangeFunctions.set('text', (prev: State, data: ActionText) => {
  const state = _.clone(prev);
  state.log = [...prev.log, data.text];
  return state;
});

// It is now a new turn
// {num: 0, type: "turn", who: 1}
stateChangeFunctions.set('turn', (prev: State, data: ActionTurn) => {
  const state = _.clone(prev);
  state.currentPlayerIndex = data.who;
  return state;
});

// Gain a clue by discarding or finishing a stack
const gainClue = (clueTokens: number) => {
  if (clueTokens === MAX_CLUE_NUM) {
    return clueTokens;
  }

  // TODO: for this function to be pure, it shouldn't depend on globals
  if (globals.variant.name.startsWith('Clue Starved')) {
    // In "Clue Starved" variants, each discard gives only half a clue.
    return clueTokens + 0.5;
  }
  return clueTokens + 1;
};
