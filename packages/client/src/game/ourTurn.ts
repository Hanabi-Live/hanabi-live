// When it becomes our turn in a game in progress, we get a desktop notification, and the move that
// we queued (a premove) is sent.

import {
  getClueCost,
  getVariantById,
  isAtMaxClueTokens,
} from "@hanabi-live/game";
import { globals } from "../Globals.ts";
import * as notifications from "../notifications.ts";
import { store } from "../store.ts";
import { toWireAction } from "../wire.ts";
import { gameUpdated } from "./gameSlice.ts";
import type { State } from "./types/State.ts";
import * as arrows from "./ui/arrows.ts";
import { PREPLAY_DELAY_MILLISECONDS } from "./ui/constants.ts";
import { isOurTurn } from "./ui/isOurTurn.ts";

export function onOurTurn(state: State): void {
  if (store.getState().session.settings.desktopNotification) {
    notifications.send("It is your turn.", "turn");
  }

  handlePremove(state);
}

/** Sends the move that we queued while it was another player's turn. */
function handlePremove(state: State) {
  const { premove } = state;
  if (premove === undefined) {
    return;
  }

  // Make a copy of the premove values and then clear the premove action.
  const oldPremove = { ...premove };
  store.dispatch(
    gameUpdated({
      type: "premove",
      premove: undefined,
    }),
  );

  // Perform some validation.
  const { clueTokens } = state.ongoingGame;
  const variant = getVariantById(state.metadata.options.variantId);
  switch (oldPremove.type) {
    case "clue": {
      // Prevent pre-cluing if there is not a clue available.
      if (clueTokens < getClueCost(variant)) {
        return;
      }

      break;
    }

    case "discard": {
      // Prevent discarding if the team is at the maximum amount of clues.
      if (isAtMaxClueTokens(clueTokens, variant)) {
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

    globals.connection.send(
      "playerAction",
      toWireAction(globals.joinedTableId, oldPremove),
    );

    // On the classic screen, hide the arrows of the queued move.
    arrows.hideAll();
  }, PREPLAY_DELAY_MILLISECONDS);
}
