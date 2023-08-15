import * as notifications from "../../notifications";
import * as clueTokensRules from "../rules/clueTokens";
import { ActionType } from "../types/ActionType";
import type { ClientAction } from "../types/ClientAction";
import * as arrows from "./arrows";
import { PREPLAY_DELAY_MILLISECONDS } from "./constants";
import { globals } from "./globals";
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
  const { type, target, value } = premove;
  globals.store!.dispatch({
    type: "premove",
    premove: null,
  });

  // Perform some validation
  switch (type) {
    case ActionType.ColorClue:
    case ActionType.RankClue: {
      // Prevent pre-cluing if there is not a clue available.
      if (clueTokens < clueTokensRules.getAdjusted(1, globals.variant)) {
        return;
      }

      break;
    }

    case ActionType.Discard: {
      // Prevent discarding if the team is at the maximum amount of clues.
      if (clueTokensRules.atMax(clueTokens, globals.variant)) {
        return;
      }

      break;
    }

    default: {
      break;
    }
  }

  // We don't want to send the action right away, or else it introduces bugs.
  setTimeout(() => {
    // As a sanity check, ensure that it is still our turn.
    if (!isOurTurn()) {
      return;
    }

    globals.lobby.conn!.send("action", {
      tableID: globals.lobby.tableID,
      type,
      target,
      value,
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
    hypothetical.send(clientAction);
    return;
  }

  const { currentPlayerIndex } = globals.state.ongoingGame.turn;
  const { ourPlayerIndex } = globals.metadata;
  if (currentPlayerIndex === ourPlayerIndex) {
    replay.exit(); // Close the in-game replay if we preplayed a card in the replay
    globals.lobby.conn!.send("action", {
      tableID: globals.lobby.tableID,
      type: clientAction.type,
      target: clientAction.target,
      value: clientAction.value,
    });
    hideArrowsAndDisableDragging();
  } else {
    globals.store!.dispatch({
      type: "premove",
      premove: clientAction,
    });
  }
}

export function hideArrowsAndDisableDragging(): void {
  arrows.hideAll();

  // Make all of the cards in our hand not draggable. (But we need to keep them draggable if the
  // pre-play setting is enabled.)
  if (!globals.lobby.settings.speedrunPreplay) {
    ourHand.checkSetDraggableAll();
  }
}
