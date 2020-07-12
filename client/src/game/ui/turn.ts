import { PREPLAY_DELAY } from '../../constants';
import * as notifications from '../../notifications';
import ActionType from '../types/ActionType';
import ClientAction from '../types/ClientAction';
import { MAX_CLUE_NUM } from '../types/constants';
import * as arrows from './arrows';
import globals from './globals';
import * as hypothetical from './hypothetical';
import * as replay from './replay';

export const begin = () => {
  showClueUIAndEnableDragging();

  if (globals.animateFast) {
    return;
  }

  if (globals.lobby.settings.desktopNotification) {
    notifications.send('It is your turn.', 'turn');
  }

  handlePremove();
};

// Handle pre-playing / pre-discarding / pre-cluing
const handlePremove = () => {
  // Local variables
  const state = globals.store!.getState();
  const premove = state.premove;
  const clueTokens = state.ongoingGame.clueTokens;

  if (premove === null) {
    return;
  }

  // Get rid of the pre-move button, since it is now our turn
  globals.elements.premoveCancelButton!.hide();
  globals.layers.UI.batchDraw();

  // Perform some validation
  switch (premove.type) {
    case ActionType.ColorClue:
    case ActionType.RankClue: {
      // Prevent pre-cluing if the team is now at 0 clues
      if (clueTokens === 0) {
        return;
      }

      break;
    }

    case ActionType.Discard: {
      // Prevent discarding if the team is at the maximum amount of clues
      if (clueTokens === MAX_CLUE_NUM) {
        return;
      }

      break;
    }

    default: {
      break;
    }
  }

  // We don't want to send the queued action right away, or else it introduces bugs
  setTimeout(() => {
    // As a sanity check, ensure that there is still a queued action
    if (globals.store!.getState().premove === null) {
      return;
    }

    globals.lobby.conn!.send('action', {
      tableID: globals.lobby.tableID,
      type: premove.type,
      target: premove.target,
      value: premove.value,
    });

    globals.store!.dispatch({ type: 'premove', premove: null });
    hideClueUIAndDisableDragging();
  }, PREPLAY_DELAY);
};

export const showClueUIAndEnableDragging = () => {
  if (globals.inReplay && !globals.hypothetical) {
    return;
  }

  if (globals.ourTurn || globals.hypothetical) {
    // Reset and show the clue UI
    if (globals.playerNames.length === 2) {
      // In 2-player games,
      // default the clue recipient button to the only other player available
      // Otherwise, leave the last player selected
      globals.elements.clueTargetButtonGroup!.list[0].setPressed(true);
    }
    globals.elements.clueTypeButtonGroup!.clearPressed();
    globals.elements.clueArea!.show();
    if (globals.elements.yourTurn !== null && !globals.hypothetical) {
      globals.elements.yourTurn.show();
    }
    globals.elements.currentPlayerArea!.hide();

    // Fade the clue UI if there is not a clue available
    if (globals.clues >= 1) {
      globals.elements.clueArea!.opacity(1);
      globals.elements.clueAreaDisabled!.hide();
    } else {
      globals.elements.clueArea!.opacity(0.2);
      globals.elements.clueAreaDisabled!.show();
    }
  }

  const ourHand = globals.elements.playerHands[globals.playerUs];
  if (ourHand === undefined) {
    throw new Error(`Failed to get our hand with an index of ${globals.playerUs}.`);
  }
  ourHand.checkSetDraggableAll();

  if (globals.options.deckPlays) {
    globals.elements.deck!.cardBack.draggable(globals.deckSize === 1);
    globals.elements.deckPlayAvailableLabel!.visible(globals.deckSize === 1);

    // Ensure the deck is above other cards and UI elements
    if (globals.deckSize === 1) {
      globals.elements.deck!.moveToTop();
    }
  }

  globals.layers.UI.batchDraw();
};

export const end = (clientAction: ClientAction) => {
  if (globals.hypothetical) {
    hypothetical.send(clientAction);
    hideClueUIAndDisableDragging();
    return;
  }

  if (globals.ourTurn) {
    replay.exit(); // Close the in-game replay if we preplayed a card in the replay
    globals.lobby.conn!.send('action', {
      tableID: globals.lobby.tableID,
      type: clientAction.type,
      target: clientAction.target,
      value: clientAction.value,
    });
    hideClueUIAndDisableDragging();
  } else {
    globals.store!.dispatch({ type: 'premove', premove: clientAction });
  }
};

export const hideClueUIAndDisableDragging = () => {
  globals.elements.clueArea!.hide();
  globals.elements.clueAreaDisabled!.hide();
  if (globals.elements.yourTurn !== null) {
    globals.elements.yourTurn.hide();
  }
  globals.elements.currentPlayerArea!.hide();
  globals.elements.premoveCancelButton!.hide();
  globals.elements.noDiscardBorder!.hide();
  globals.elements.noDoubleDiscardBorder!.hide();
  arrows.hideAll();

  // Make all of the cards in our hand not draggable
  // (but we need to keep them draggable if the pre-play setting is enabled)
  if (!globals.lobby.settings.speedrunPreplay) {
    const ourHand = globals.elements.playerHands[globals.playerUs];
    ourHand.children.each((child) => {
      // This is a LayoutChild
      child.off('dragend');
      child.draggable(false);
    });
  }

  globals.elements.deck!.cardBack.draggable(false);
  globals.elements.deckPlayAvailableLabel!.hide();
};
