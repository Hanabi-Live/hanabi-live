import { globals as lobbyGlobals } from "../../Globals.ts";
import { store } from "../../store.ts";
import { toWireAction } from "../../wire.ts";
import { gameUpdated } from "../gameSlice.ts";
import * as hypothetical from "../hypothetical.ts";
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
    lobbyGlobals.connection.send(
      "playerAction",
      toWireAction(lobbyGlobals.joinedTableId, clientAction),
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
}

/** On the classic screen, shows that the move is on its way. The New UI has no such animation. */
function showWaitingOnServerAnimation() {
  globals.elements.clueArea?.hide();
  globals.elements.waitingOnServer?.show();
  globals.elements.waitingOnServerAnimation?.start();
}
