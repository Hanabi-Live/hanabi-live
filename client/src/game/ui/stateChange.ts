// Functions for building a state table for every turn
// (state tables are currently unused but eventually the client will eventually be rewritten to
// handle state transitions)

// Imports
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

// Define a command handler map
type StateChangeFunction = (data: any) => void;
const stateChangeFunctions = new Map<ActionIncludingHypothetical['type'], StateChangeFunction>();
export default stateChangeFunctions;

// A player just gave a clue
// {clue: {type: 0, value: 1}, giver: 1, list: [11], target: 2, turn: 0, type: "clue"}
stateChangeFunctions.set('clue', (data: ActionClue) => {
  globals.state.clueTokens -= 1;
  globals.state.clues.push({
    type: data.clue.type,
    value: data.clue.value,
    giver: data.giver,
    target: data.target,
    turn: data.turn,
  });

  const hand = globals.state.hands[data.target];
  if (hand) {
    for (const order of hand) {
      const card = globals.state.deck[order];
      card.clues.push({
        type: data.clue.type,
        value: data.clue.value,
        positive: data.list.includes(order),
      });
    }
  } else {
    throw new Error(`Failed to get "globals.state.hands[]" with an index of ${data.target}.`);
  }

  // TODO: Side effects
  // sideEffects.changeClues(globals.state.clueTokens);
});

// The game is over and the server gave us a list of every card in the deck
// {deck: [{suit: 0, rank: 1}, {suit: 2, rank: 2}, ...], type: "deckOrder", }
stateChangeFunctions.set('deckOrder', (data: ActionDeckOrder) => {
  globals.deckOrder = data.deck;
});

// A player just discarded a card
// {failed: false, type: "discard", which: {index: 0, order: 4, rank: 1, suit: 2}}
stateChangeFunctions.set('discard', (data: ActionDiscard) => {
  // Reveal all cards discarded
  const card = globals.state.deck[data.which.order];
  if (!card) {
    throw new Error(`Failed to get the card for index ${data.which.order}.`);
  }
  card.suit = data.which.suit;
  card.rank = data.which.rank;

  // Remove it from the hand
  const hand = globals.state.hands[data.which.index];
  const handIndex = hand.indexOf(data.which.order);
  if (handIndex !== -1) {
    hand.splice(handIndex, 1);
  }

  // Add it to the discard stacks
  globals.state.discardStacks[card.suit].push(data.which.order);

  if (!data.failed) {
    gainClue();
  }
});

// A player just drew a card from the deck
// {order: 0, rank: 1, suit: 4, type: "draw", who: 0}
stateChangeFunctions.set('draw', (data: ActionDraw) => {
  globals.state.deckSize -= 1;
  globals.state.deck[data.order] = {
    suit: data.suit,
    rank: data.rank,
    clues: [],
  };
  const hand = globals.state.hands[data.who];
  if (hand) {
    hand.push(data.order);
  }
});

// A player just played a card
// {type: "play", which: {index: 0, order: 4, rank: 1, suit: 2}}
// (index is the player index)
stateChangeFunctions.set('play', (data: ActionPlay) => {
  // Reveal all cards played
  const card = globals.state.deck[data.which.order];
  if (!card) {
    throw new Error(`Failed to get the card for index ${data.which.order}.`);
  }
  card.suit = data.which.suit;
  card.rank = data.which.rank;

  // Remove it from the hand
  const hand = globals.state.hands[data.which.index];
  const handIndex = hand.indexOf(data.which.order);
  if (handIndex !== -1) {
    hand.splice(handIndex, 1);
  }

  // Add it to the play stacks
  globals.state.playStacks[card.suit].push(data.which.order);

  // Get clues if the stack is complete
  if (globals.state.playStacks[card.suit].length === 5) {
    gainClue();
  }
});

// An action has been taken, so there may be a change to game state variables
// {clues: 5, doubleDiscard: false, maxScore: 24, score: 18, type: "status"}
stateChangeFunctions.set('status', (data: ActionStatus) => {
  globals.state.doubleDiscard = data.doubleDiscard;
  globals.state.maxScore = data.maxScore;
  globals.state.score = data.score;

  // At this point, check the local state matches the server
  if (data.clues !== globals.state.clueTokens) {
    console.warn('The clues from client and server don\'t match. '
    + `Client = ${globals.state.clueTokens}, Server = ${data.clues}`);
  }
});

// A player failed to play a card
// {num: 1, order: 24, turn: 32, type: "strike"}
stateChangeFunctions.set('strike', (data: ActionStrike) => {
  globals.state.strikes.push({
    order: data.order,
    turn: data.turn,
  });
});

// A line of text was recieved from the server
// {text: "Razgovor plays Black 2 from slot #1", type: "text"}
stateChangeFunctions.set('text', (data: ActionText) => {
  globals.state.log.push(data.text);
});

// It is now a new turn
// {num: 0, type: "turn", who: 1}
stateChangeFunctions.set('turn', (data: ActionTurn) => {
  globals.state.currentPlayerIndex = data.who;

  // TODO: Update the UI to match state
  // sideEffects.updateToState(globals.state);

  // Make a copy of the current state and store it in the state table
  globals.states[data.num] = JSON.parse(JSON.stringify(globals.state));
});

// Gain a clue by discarding or finishing a stack
const gainClue = () => {
  if (globals.variant.name.startsWith('Clue Starved')) {
    // In "Clue Starved" variants, each discard gives only half a clue.
    globals.state.clueTokens += 0.5;
  } else {
    globals.state.clueTokens += 1;
  }
};
