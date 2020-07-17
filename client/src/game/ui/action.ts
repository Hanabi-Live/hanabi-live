// The "gameAction" WebSocket command communicate a change in the game state

import {
  ActionIncludingHypothetical,
  ActionTurn,
} from '../types/actions';
import globals from './globals';

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

actionFunctions.set('turn', (data: ActionTurn) => {
  // Store the current turn in memory
  globals.turn = data.num;
});
