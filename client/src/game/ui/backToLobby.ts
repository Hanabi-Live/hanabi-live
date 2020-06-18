import * as chat from '../../chat';
import globals from './globals';
import * as timer from './timer';

export default () => {
  // Hide the tooltip, if showing
  if (globals.activeHover) {
    globals.activeHover.dispatchEvent(new MouseEvent('mouseout'));
    globals.activeHover = null;
  }

  // Stop any timer-related callbacks
  timer.stop();

  // Clear the typing list
  globals.lobby.peopleTyping = [];
  chat.updatePeopletyping();

  globals.lobby.conn!.send('tableUnattend', {
    tableID: globals.lobby.tableID,
  });
  globals.game!.hide();

  // Reset the URL since we are now in the lobby
  window.history.pushState('', '', '/');
};
