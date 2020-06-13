// Imports
import * as notifications from '../../notifications';
import { ActionType, ClientAction } from '../types/ClientAction';
import { MAX_CLUE_NUM } from '../types/constants';
import * as arrows from './arrows';
import globals from './globals';
import * as hypothetical from './hypothetical';
import LayoutChild from './LayoutChild';
import * as replay from './replay';

export const begin = () => {
  showClueUIAndEnableDragging();

  if (globals.animateFast) {
    return;
  }

  if (globals.lobby.settings.desktopNotification) {
    notifications.send('It is your turn.', 'turn');
  }

  // Handle pre-playing / pre-discarding / pre-cluing
  if (globals.queuedAction !== null) {
    // Get rid of the pre-move button, since it is now our turn
    globals.elements.premoveCancelButton!.hide();
    globals.layers.UI.batchDraw();

    if (
      globals.queuedAction.type === ActionType.ColorClue
      || globals.queuedAction.type === ActionType.RankClue
    ) {
      // Prevent pre-cluing if the team is now at 0 clues
      if (globals.clues === 0) {
        return;
      }

      // Prevent pre-cluing if the card is no longer in the hand
      if (globals.preCluedCardOrder === null) {
        throw new Error('"globals.preCluedCardOrder" was null in the "turn.begin()" function.');
      }
      const card = globals.deck[globals.preCluedCardOrder];
      if (card.state.isPlayed || card.state.isDiscarded) {
        return;
      }
    }

    // Prevent discarding if the team is at the maximum amount of clues
    if (globals.queuedAction.type === ActionType.Discard && globals.clues === MAX_CLUE_NUM) {
      return;
    }

    // We don't want to send the queued action right away, or else it introduces bugs
    setTimeout(() => {
      if (globals.queuedAction === null) {
        return;
      }

      globals.lobby.conn!.send('action', {
        tableID: globals.lobby.tableID,
        type: globals.queuedAction.type,
        target: globals.queuedAction.target,
        value: globals.queuedAction.value,
      });

      globals.queuedAction = null;
      globals.preCluedCardOrder = null;
      hideClueUIAndDisableDragging();
    }, 100);
  }
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

  // Set our hand to being draggable
  if (
    // This is unnecessary if the pre-play setting is enabled,
    // as the hand will already be draggable
    !globals.lobby.settings.speedrunPreplay
    // This is unnecessary if this a speedrun,
    // as clicking on cards takes priority over dragging cards
    && !globals.options.speedrun
    // In hypotheticals, setting cards to be draggable is handled elsewhere
    && !globals.hypothetical
  ) {
    const ourHand = globals.elements.playerHands[globals.playerUs];
    if (ourHand) {
      for (const layoutChild of ourHand.children.toArray() as LayoutChild[]) {
        layoutChild.checkSetDraggable();
      }
    } else {
      throw new Error(`Failed to get "globals.elements.playerHands[]" with an index of ${globals.playerUs}.`);
    }
  }

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

export const end = (actionObject: ClientAction) => {
  if (globals.hypothetical) {
    hypothetical.send(actionObject);
    hideClueUIAndDisableDragging();
    return;
  }

  if (globals.ourTurn) {
    replay.exit(); // Close the in-game replay if we preplayed a card in the replay
    globals.lobby.conn!.send('action', {
      tableID: globals.lobby.tableID,
      type: actionObject.type,
      target: actionObject.target,
      value: actionObject.value,
    });
    hideClueUIAndDisableDragging();
  } else {
    globals.queuedAction = actionObject;
    let text = 'Cancel Pre-';
    if (globals.queuedAction.type === ActionType.Play) {
      text += 'Play';
    } else if (globals.queuedAction.type === ActionType.Discard) {
      text += 'Discard';
    } else if (
      globals.queuedAction.type === ActionType.ColorClue
      || globals.queuedAction.type === ActionType.RankClue
    ) {
      text += 'Clue';
    }
    globals.elements.premoveCancelButton!.text(text);
    globals.elements.premoveCancelButton!.show();
    globals.elements.currentPlayerArea!.hide();
    globals.layers.UI.batchDraw();
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
    for (const child of ourHand.children.toArray()) {
      // This is a LayoutChild
      child.off('dragend');
      child.draggable(false);
    }
  }

  globals.elements.deck!.cardBack.draggable(false);
  globals.elements.deckPlayAvailableLabel!.hide();
};
