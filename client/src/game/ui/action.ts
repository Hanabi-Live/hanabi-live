// The "gameAction" WebSocket command communicate a change in the game state

import { nullIfNegative } from '../../misc';
// import { getCharacter } from '../data/gameData';
import * as variantRules from '../rules/variant';
import {
  ActionDiscard,
  ActionIncludingHypothetical,
  ActionHypotheticalMorph,
  ActionReorder,
  ActionTurn,
} from '../types/actions';
import globals from './globals';
import HanabiCard from './HanabiCard';
import LayoutChild from './LayoutChild';
import statusCheckOnAllCards from './statusCheckOnAllCards';

// The server has sent us a new game action
// (either during an ongoing game or as part of a big list that was sent upon loading a new
// game/replay)
export default function action(data: ActionIncludingHypothetical) {
  // If a user is editing a note and an action in the game happens,
  // mark to make the tooltip go away as soon as they are finished editing the note
  if (globals.editingNote !== null) {
    globals.actionOccurred = true;
  }

  const actionFunction = actionFunctions.get(data.type);
  if (actionFunction !== undefined) {
    actionFunction(data);
  }
}

// Define a command handler map
type ActionFunction = (data: any) => void;
const actionFunctions = new Map<ActionIncludingHypothetical['type'], ActionFunction>();

actionFunctions.set('discard', (data: ActionDiscard) => {
  // In "Throw It in a Hole" variants, convert misplays to real plays
  if (variantRules.isThrowItInAHole(globals.variant) && !globals.replay && data.failed) {
    actionFunctions.get('play')!(data);
    return;
  }

  // The fact that this card was discarded could make some other cards useless or critical
  statusCheckOnAllCards();
});

actionFunctions.set('play', () => {
  // The fact that this card was played could make some other cards useless or critical
  statusCheckOnAllCards();
});

// Has the following data:
// {
//   type: 'reorder',
//   target: 0, // The index of the player
//   handOrder: [1, 2, 3, 4, 0], // An array of card orders
// }
actionFunctions.set('reorder', (data: ActionReorder) => {
  // Make a list of card orders currently in the hand
  const hand = globals.elements.playerHands[data.target];
  const currentCardOrders: number[] = [];
  hand.children.each((layoutChild) => {
    const card = layoutChild.children[0] as unknown as HanabiCard;
    currentCardOrders.push(card.state.order);
  });

  for (let i = 0; i < data.handOrder.length; i++) {
    const newCardOrderForThisSlot = data.handOrder[i];
    if (typeof newCardOrderForThisSlot !== 'number') {
      throw new Error(`Received an invalid card order of ${newCardOrderForThisSlot} in the "reorder" action.`);
    }
    const currentIndexOfNewCard = currentCardOrders.indexOf(newCardOrderForThisSlot);
    const numMoveDown = currentIndexOfNewCard - i;
    const card = globals.deck[newCardOrderForThisSlot];
    if (card === undefined) {
      throw new Error(`Received an invalid card order of ${newCardOrderForThisSlot} in the "reorder" action.`);
    }
    const layoutChild = card.parent as unknown as LayoutChild; // All cards should have parents
    for (let j = 0; j < numMoveDown; j++) {
      layoutChild.moveDown();
    }
  }
});

actionFunctions.set('morph', (data: ActionHypotheticalMorph) => {
  console.log(data, 'TODO');
  /*
  // This is the reveal for hypotheticals when a card is morphed
  // The code here is copied from the "websocket.ts" file
  let card = globals.deck[data.order];
  if (!card) {
    card = globals.stackBases[data.order - globals.deck.length];
  }
  if (!card) {
    throw new Error('Failed to get the card in the "reveal" command.');
  }

  card.convert(data.suitIndex, data.rank);
  globals.layers.card.batchDraw();
  */
});

actionFunctions.set('turn', (data: ActionTurn) => {
  // Store the current turn in memory
  globals.turn = data.num;
  globals.currentPlayerIndex = nullIfNegative(data.currentPlayerIndex);

  if (!globals.animateFast) {
    globals.layers.UI.batchDraw();
  }
});
