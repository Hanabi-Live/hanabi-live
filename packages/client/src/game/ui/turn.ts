import { getClueCost, isAtMaxClueTokens } from "@hanabi-live/game";
import * as notifications from "../../notifications.ts";
import { toWireAction } from "../../wire.ts";
import { isOurSeat } from "../ourSeat.ts";
import type { ClientAction } from "../types/ClientAction.ts";
import { globals } from "./UiGlobals.ts";
import * as arrows from "./arrows.ts";
import * as cluePreview from "./cluePreview.ts";
import { PREPLAY_DELAY_MILLISECONDS } from "./constants.ts";
import * as hypothetical from "./hypothetical.ts";
import { isOurTurn } from "./isOurTurn.ts";
import * as replay from "./replay.ts";

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

  if (premove === undefined) {
    return;
  }

  // Make a copy of the premove values and then clear the premove action.
  const oldPremove = { ...premove };
  globals.store!.dispatch({
    type: "premove",
    premove: undefined,
  });

  // Perform some validation.
  switch (oldPremove.type) {
    case "clue": {
      // Prevent pre-cluing if there is not a clue available.
      if (clueTokens < getClueCost(globals.variant)) {
        return;
      }

      break;
    }

    case "discard": {
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

    globals.lobby.conn!.send(
      "playerAction",
      toWireAction(globals.lobby.joinedTableId, oldPremove),
    );

    arrows.hideAll();
  }, PREPLAY_DELAY_MILLISECONDS);
}

export function resetSelectedClue(): void {
  // Reset the clue UI, leaving the last target player selected.
  globals.elements.clueTypeButtonGroup!.clearPressed();
  cluePreview.reset();

  globals.layers.UI.batchDraw();
}

export function end(clientAction: ClientAction): void {
  if (globals.state.replay.hypothetical !== undefined) {
    hypothetical.sendHypotheticalAction(clientAction);
    return;
  }

  const { currentPlayerIndex } = globals.state.ongoingGame.turn;

  if (isOurSeat(currentPlayerIndex, globals.metadata)) {
    replay.exit(); // Close the in-game replay in case we preplayed a card in the replay.
    arrows.hideAll();
    showWaitingOnServerAnimation();
    globals.lobby.conn!.send(
      "playerAction",
      toWireAction(globals.lobby.joinedTableId, clientAction),
    );
    return;
  }

  if (globals.lobby.settings.preplay) {
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
