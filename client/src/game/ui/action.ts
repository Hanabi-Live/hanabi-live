// The "gameAction" WebSocket command communicate a change in the game state

import { nullIfNegative } from '../../misc';
// import { getCharacter } from '../data/gameData';
import * as variantRules from '../rules/variant';
import {
  ActionDiscard,
  ActionIncludingHypothetical,
  ActionTurn,
} from '../types/actions';
import globals from './globals';
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

actionFunctions.set('turn', (data: ActionTurn) => {
  // Store the current turn in memory
  globals.turn = data.num;
  globals.currentPlayerIndex = nullIfNegative(data.currentPlayerIndex);

  if (!globals.animateFast) {
    globals.layers.UI.batchDraw();
  }
});
