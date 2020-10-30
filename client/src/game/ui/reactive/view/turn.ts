/* eslint-disable import/prefer-default-export */

import globals from "../../globals";
import isOurTurn from "../../isOurTurn";
import * as ourHand from "../../ourHand";
import * as turn from "../../turn";

export function onOngoingTurnChanged(): void {
  ourHand.checkSetDraggableAll();

  if (isOurTurn()) {
    turn.begin();
  }

  if (globals.elements.yourTurn !== null) {
    const visible = isOurTurn() && globals.state.replay.hypothetical === null;
    globals.elements.yourTurn.visible(visible);
  }
}
