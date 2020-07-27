import * as chat from '../../chat';
import { trimReplaySuffixFromURL } from '../../misc';
import globals from './globals';
import * as timer from './timer';
import * as tooltips from './tooltips';

export default function backToLobby() {
  // Hide the tooltip, if showing
  tooltips.resetActiveHover();

  // Stop any timer-related callbacks
  timer.stop();

  // Clear the typing list
  globals.lobby.peopleTyping = [];
  chat.updatePeopleTyping();

  // Trim the replay suffix from the URL, if any
  trimReplaySuffixFromURL();

  globals.lobby.conn!.send('tableUnattend', {
    tableID: globals.lobby.tableID,
  });
  globals.game!.hide();
}
