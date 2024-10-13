import { getAdjustedClueTokens, isAtMaxClueTokens } from "@hanabi-live/game";
import * as notifications from "../../notifications";
import { ActionType } from "../types/ActionType";
import type { ClientAction } from "../types/ClientAction";
import { globals } from "./UIGlobals";
import * as arrows from "./arrows";
import { PREPLAY_DELAY_MILLISECONDS } from "./constants";
import * as hypothetical from "./hypothetical";
import { isOurTurn } from "./isOurTurn";
import * as ourHand from "./ourHand";
import * as replay from "./replay";

export function begin(): void {
  resetSelectedClue();

  if (globals.animateFast) {
    return;
  }

  if (globals.lobby.settings.desktopNotification) {
    notifications.send("It is your turn.", "turn");
  }

  handlePremove();
}

// Handle pre-playing / pre-discarding / pre-cluing.
function handlePremove() {
  const { premove } = globals.state;
  const { clueTokens } = globals.state.ongoingGame;

  if (premove === null) {
    return;
  }

  // Make a copy of the premove values and then clear the premove action.
  const oldPremove = { ...premove };
  globals.store!.dispatch({
    type: "premove",
    premove: null,
  });

  // Perform some validation.
  switch (oldPremove.type) {
    case ActionType.ColorClue:
    case ActionType.RankClue: {
      // Prevent pre-cluing if there is not a clue available.
      if (clueTokens < getAdjustedClueTokens(1, globals.variant)) {
        return;
      }

      break;
    }

    case ActionType.Discard: {
      // Prevent discarding if the team is at the maximum amount of clues.
      if (isAtMaxClueTokens(clueTokens, globals.variant)) {
        return;
      }

      break;
    }

    default: {
      break;
    }
  }

  // We do not want to send the action right away, or else it introduces bugs.
  setTimeout(() => {
    // As a sanity check, ensure that it is still our turn.
    if (!isOurTurn()) {
      return;
    }

    globals.lobby.conn!.send("action", {
      tableID: globals.lobby.tableID,
      ...oldPremove,
    });

    hideArrowsAndDisableDragging();
  }, PREPLAY_DELAY_MILLISECONDS);
}

export function resetSelectedClue(): void {
  // Reset the clue UI, leaving the last target player selected.
  globals.elements.clueTypeButtonGroup!.clearPressed();

  globals.layers.UI.batchDraw();
}

export function end(clientAction: ClientAction): void {
  if (globals.state.replay.hypothetical !== null) {
    hypothetical.sendHypotheticalAction(clientAction);
    return;
  }

  const { currentPlayerIndex } = globals.state.ongoingGame.turn;
  const { ourPlayerIndex } = globals.metadata;

  if (currentPlayerIndex === ourPlayerIndex) {
    replay.exit(); // Close the in-game replay in case we preplayed a card in the replay.
    hideArrowsAndDisableDragging();
    showWaitingOnServerAnimation();
    globals.lobby.conn!.send("action", {
      tableID: globals.lobby.tableID,
      ...clientAction,
    });
    return;
  }

  if (globals.lobby.settings.speedrunPreplay) {
    globals.store!.dispatch({
      type: "premove",
      premove: clientAction,
    });
  }
}

function showWaitingOnServerAnimation() {
  globals.elements.clueArea!.hide();

  globals.elements.waitingOnServer!.show();
  globals.elements.waitingOnServerAnimation!.start();
}

export function hideArrowsAndDisableDragging(): void {
  arrows.hideAll();

  // Make all of the cards in our hand not draggable. (But we need to keep them draggable if the
  // pre-play setting is enabled.)
  if (!globals.lobby.settings.speedrunPreplay) {
    ourHand.checkSetDraggableAll();
  }
}
