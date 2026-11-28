// When it becomes our turn in a game in progress, we get a desktop notification, and the move that
// we queued (a premove) is sent.

import {
  getClueCost,
  getVariantById,
  isDiscardAllowed,
} from "@hanabi-live/game";
import { globals } from "../Globals.ts";
import * as notifications from "../notifications.ts";
import { store } from "../store.ts";
import { toWireAction } from "../wire.ts";
import { gameUpdated } from "./gameSlice.ts";
import { newUiMoveSent, newUiSentMoveCleared } from "./newUi/newUiSlice.ts";
import type { ClientAction } from "./types/ClientAction.ts";
import type { State } from "./types/State.ts";
import * as arrows from "./ui/arrows.ts";
import { PREPLAY_DELAY_MILLISECONDS } from "./ui/constants.ts";
import { isOurTurnInOngoingGame } from "./ui/isOurTurn.ts";

export function onOurTurn(state: State): void {
  if (store.getState().session.settings.desktopNotification) {
    notifications.send("It is your turn.", "turn");
  }

  handlePremove(state);
}

/**
 * Sends the move that we queued while it was another player's turn. A move that the game no longer
 * allows is dropped instead.
 */
function handlePremove(state: State) {
  const { premove } = state;
  if (premove === undefined) {
    return;
  }

  // Make a copy of the premove values.
  const oldPremove = { ...premove };
  const { turnNum } = state.ongoingGame.turn;
  const allowed = isPremoveAllowed(state, oldPremove);

  // Until the server answers, the move counts as sent, so that we cannot make a second move on this
  // turn, and so that the New UI shows that the queued move is on its way (see "ui/turn.ts" and
  // "newUi/useQueuedMove.ts"). A move that is dropped does not count as sent.
  if (allowed) {
    store.dispatch(
      newUiMoveSent({
        move: oldPremove,
        turnNum,
      }),
    );
  }

  // Clear the premove action.
  store.dispatch(
    gameUpdated({
      type: "premove",
      premove: undefined,
    }),
  );

  if (!allowed) {
    return;
  }

  /** The move was not sent, or the server refused it, so it no longer waits. */
  function clearSentMove() {
    if (store.getState().newUi.sentMove?.turnNum === turnNum) {
      store.dispatch(newUiSentMoveCleared());
    }
  }

  // We do not want to send the action right away, or else it introduces bugs.
  setTimeout(() => {
    // As a sanity check, ensure that it is still our turn.
    if (!isOurTurnInOngoingGame()) {
      clearSentMove();
      return;
    }

    globals.connection.send(
      "playerAction",
      toWireAction(globals.joinedTableId, oldPremove),
      (reply) => {
        if (!reply.ok) {
          clearSentMove();
        }
      },
    );

    // On the classic screen, hide the arrows of the queued move.
    arrows.hideAll();
  }, PREPLAY_DELAY_MILLISECONDS);
}

/** Whether the game still allows the move that we queued. */
function isPremoveAllowed(state: State, premove: ClientAction): boolean {
  const { clueTokens } = state.ongoingGame;
  const variant = getVariantById(state.metadata.options.variantId);
  switch (premove.type) {
    // Prevent pre-cluing if there is not a clue available.
    case "clue": {
      return clueTokens >= getClueCost(variant);
    }

    // Prevent discarding if the team is at the maximum amount of clues.
    case "discard": {
      return isDiscardAllowed(clueTokens, variant);
    }

    default: {
      return true;
    }
  }
}
