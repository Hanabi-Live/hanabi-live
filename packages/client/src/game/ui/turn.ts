import { globals as lobbyGlobals } from "../../Globals.ts";
import { store } from "../../store.ts";
import { toWireAction } from "../../wire.ts";
import * as gameSession from "../gameSession.ts";
import { gameUpdated } from "../gameSlice.ts";
import * as hypothetical from "../hypothetical.ts";
import { newUiMoveSent, newUiSentMoveCleared } from "../newUi/newUiSlice.ts";
import { isOurSeat } from "../ourSeat.ts";
import type { ClientAction } from "../types/ClientAction.ts";
import { globals } from "./UiGlobals.ts";
import * as arrows from "./arrows.ts";
import * as cluePreview from "./cluePreview.ts";
import * as replay from "./replay.ts";

export function resetSelectedClue(): void {
  // Reset the clue UI, leaving the last target player selected.
  globals.elements.clueTypeButtonGroup!.clearPressed();
  cluePreview.reset();

  globals.layers.UI.batchDraw();
}

/**
 * Makes the move in the game, or in the hypothetical when there is one. When it is not our turn,
 * the move is queued instead, if the player allows that. `onNotDone` is called when the move is
 * neither made nor queued, or when the server refuses it. A dragged card uses it to go back.
 */
export function end(clientAction: ClientAction, onNotDone?: () => void): void {
  if (globals.state.replay.hypothetical !== undefined) {
    if (!hypothetical.sendHypotheticalAction(clientAction)) {
      onNotDone?.();
    }
    return;
  }

  // A spectator who watches from a player's seat does not move for them.
  if (!globals.state.playing) {
    onNotDone?.();
    return;
  }

  const { turnNum, currentPlayerIndex } = globals.state.ongoingGame.turn;

  if (isOurSeat(currentPlayerIndex, globals.metadata)) {
    // Until the server answers the move that we sent on this turn, a second move would be refused.
    // This stops a fast double click in a speedrun.
    if (store.getState().newUi.sentMove?.turnNum === turnNum) {
      onNotDone?.();
      return;
    }
    replay.exit(); // Close the in-game replay in case we preplayed a card in the replay.
    arrows.hideAll();
    showWaitingOnServer(clientAction);
    lobbyGlobals.connection.send(
      "playerAction",
      toWireAction(lobbyGlobals.joinedTableId, clientAction),
      (reply) => {
        // The server refused the move, or it never reached the server (such as when the connection
        // is down), so the move no longer waits. A move that succeeds ends the turn instead.
        if (reply.ok) {
          return;
        }

        onNotDone?.();
        if (store.getState().newUi.sentMove?.turnNum !== turnNum) {
          return;
        }

        store.dispatch(newUiSentMoveCleared());
        hideWaitingOnServer();
      },
    );
    return;
  }

  if (store.getState().session.settings.preplay) {
    store.dispatch(
      gameUpdated({
        type: "premove",
        premove: clientAction,
      }),
    );
  }

  // The move is not queued when the player has pre-playing off, or when the game refuses it.
  if (globals.state.premove === undefined) {
    onNotDone?.();
  }
}

/**
 * Shows that the move is on its way, until the server's answer arrives. The classic screen shows an
 * animation in place of the clue area. The New UI marks the place where the player acted (see
 * "SendingMark.tsx").
 */
function showWaitingOnServer(clientAction: ClientAction) {
  globals.elements.clueArea?.hide();
  globals.elements.waitingOnServer?.show();
  globals.elements.waitingOnServerAnimation?.start();

  store.dispatch(
    newUiMoveSent({
      move: clientAction,
      turnNum: globals.state.ongoingGame.turn.turnNum,
    }),
  );
}

/**
 * The move did not end our turn, so the classic screen shows the clue area again. (When a turn
 * ends, "turnView.ts" does this.)
 */
function hideWaitingOnServer() {
  if (!gameSession.isOpen()) {
    return;
  }

  globals.elements.waitingOnServer?.hide();
  globals.elements.waitingOnServerAnimation?.stop();
  globals.elements.clueArea?.visible(
    globals.state.replay.segment === undefined,
  );
  globals.layers.UI.batchDraw();
}
