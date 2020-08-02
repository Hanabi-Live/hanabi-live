import { PREPLAY_DELAY } from '../../constants';
import * as notifications from '../../notifications';
import { variantRules } from '../rules';
import ActionType from '../types/ActionType';
import ClientAction from '../types/ClientAction';
import ClueType from '../types/ClueType';
import { MAX_CLUE_NUM } from '../types/constants';
import * as arrows from './arrows';
import globals from './globals';
import * as hypothetical from './hypothetical';
import isOurTurn from './isOurTurn';
import * as ourHand from './ourHand';
import * as replay from './replay';

export const begin = () => {
  showClueUI();

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
  const premove = globals.state.premove;
  const clueTokens = globals.state.ongoingGame.clueTokens;

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
    if (globals.state.premove === null) {
      return;
    }

    globals.lobby.conn!.send('action', {
      tableID: globals.lobby.tableID,
      type: premove.type,
      target: premove.target,
      value: premove.value,
    });

    globals.store!.dispatch({
      type: 'premove',
      premove: null,
    });
    hideClueUIAndDisableDragging();
  }, PREPLAY_DELAY);
};

export const showClueUI = () => {
  if (!isOurTurn()) {
    return;
  }

  // Don't show the clue UI if it gets to be our turn and we happen to be viewing past actions in an
  // in-game replay
  if (globals.state.replay.active && globals.state.replay.hypothetical === null) {
    return;
  }

  // Reset and show the clue UI
  if (globals.options.numPlayers === 2) {
    // In 2-player games,
    // default the clue recipient button to the only other player available
    // Otherwise, leave the last player selected
    globals.elements.clueTargetButtonGroup!.list[0].setPressed(true);
  }
  globals.elements.clueTypeButtonGroup!.clearPressed();
  globals.elements.clueArea!.show();
  if (globals.elements.yourTurn !== null && globals.state.replay.hypothetical === null) {
    globals.elements.yourTurn.show();
  }
  globals.elements.currentPlayerArea!.hide();

  // Hide some specific clue buttons in certain variants with clue restrictions
  if (variantRules.isAlternatingClues(globals.variant)) {
    const ongoingGameState = globals.state.replay.hypothetical === null
      ? globals.state.ongoingGame
      : globals.state.replay.hypothetical.ongoing;
    if (ongoingGameState.clues.length > 0) {
      const lastClue = ongoingGameState.clues[ongoingGameState.clues.length - 1];
      if (lastClue.type === ClueType.Color) {
        for (const button of globals.elements.colorClueButtons) {
          button.hide();
        }
        for (const button of globals.elements.rankClueButtons) {
          button.show();
        }
      } else if (lastClue.type === ClueType.Rank) {
        for (const button of globals.elements.colorClueButtons) {
          button.show();
        }
        for (const button of globals.elements.rankClueButtons) {
          button.hide();
        }
      }
    }
  }

  // Fade the clue UI if there is not a clue available
  if (globals.clues >= 1) {
    globals.elements.clueArea!.opacity(1);
    globals.elements.clueAreaDisabled!.hide();
  } else {
    globals.elements.clueArea!.opacity(0.2);
    globals.elements.clueAreaDisabled!.show();
  }

  if (globals.options.deckPlays) {
    const deckSize = globals.state.ongoingGame.deckSize;
    globals.elements.deck!.cardBack.draggable(deckSize === 1);
    globals.elements.deckPlayAvailableLabel!.visible(deckSize === 1);

    // Ensure the deck is above other cards and UI elements
    if (deckSize === 1) {
      globals.elements.deck!.moveToTop();
    }
  }

  globals.layers.UI.batchDraw();
};

export const end = (clientAction: ClientAction) => {
  if (globals.state.replay.hypothetical !== null) {
    hypothetical.send(clientAction);
    hideClueUIAndDisableDragging();
    return;
  }

  const currentPlayerIndex = globals.state.ongoingGame.turn.currentPlayerIndex;
  const ourPlayerIndex = globals.state.metadata.ourPlayerIndex;
  if (currentPlayerIndex === ourPlayerIndex) {
    replay.exit(); // Close the in-game replay if we preplayed a card in the replay
    globals.lobby.conn!.send('action', {
      tableID: globals.lobby.tableID,
      type: clientAction.type,
      target: clientAction.target,
      value: clientAction.value,
    });
    hideClueUIAndDisableDragging();
  } else {
    globals.store!.dispatch({
      type: 'premove',
      premove: clientAction,
    });
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
    ourHand.checkSetDraggableAll();
  }

  globals.elements.deck!.cardBack.draggable(false);
  globals.elements.deckPlayAvailableLabel!.hide();
};
