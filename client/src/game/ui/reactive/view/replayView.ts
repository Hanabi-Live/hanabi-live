/* eslint-disable import/prefer-default-export */

import globals from '../../globals';
import isOurTurn from '../../isOurTurn';
import * as ourHand from '../../ourHand';
import * as replay from '../../replay';
import * as turn from '../../turn';

export function onActiveChanged(active: boolean, previousActive: boolean | undefined) {
  ourHand.checkSetDraggableAll();

  if (!active && previousActive === true) {
    // We are exiting from a replay
    if (globals.store!.getState().premove !== null) {
      globals.elements.premoveCancelButton!.show();
    }
    if (isOurTurn()) {
      turn.showClueUI();
    }

    globals.layers.UI.batchDraw();
  }
}

export function onGameSegmentChanged(gameSegment: number | null) {
  if (gameSegment === null) {
    return;
  }

  // We need to update the replay slider, based on the new amount of segments
  globals.replayMax = gameSegment;
  if (globals.inReplay) {
    replay.adjustShuttles(false);
    globals.elements.replayForwardButton!.setEnabled(true);
    globals.elements.replayForwardFullButton!.setEnabled(true);
    globals.layers.UI.batchDraw();
  }

  // If there is something to rewind to, ensure that the "In-Game Replay" button is enabled
  if (!globals.replay && gameSegment > 0) {
    globals.elements.replayButton!.setEnabled(true);
  }
}
