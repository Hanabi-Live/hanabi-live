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

export function onActiveOrOngoingGameSegmentChanged(data: {
  active: boolean;
  segment: number | null;
}) {
  if (!data.active) {
    // TODO add replay exit code here
    return;
  }

  if (data.segment === null) {
    return;
  }

  // We need to update the replay slider, based on the new amount of segments
  replay.adjustShuttles(false);

  // If we are on the last segment, disable the forward replay buttons
  const replaySegment = globals.store!.getState().replay.segment;
  globals.elements.replayForwardButton!.setEnabled(replaySegment !== data.segment);
  globals.elements.replayForwardFullButton!.setEnabled(replaySegment !== data.segment);

  globals.layers.UI.batchDraw();
}

export function onReplaySegmentChanged(segment: number | null) {
  if (segment === null) {
    return;
  }

  // If we are on the first segment, disable the rewind replay buttons
  globals.elements.replayBackFullButton!.setEnabled(segment !== 0);
  globals.elements.replayBackButton!.setEnabled(segment !== 0);

  // If we are on the last segment, disable the forward replay buttons
  const finalSegment = globals.store!.getState().ongoingGame.turn.segment!;
  globals.elements.replayForwardButton!.setEnabled(segment !== finalSegment);
  globals.elements.replayForwardFullButton!.setEnabled(segment !== finalSegment);

  globals.layers.UI.batchDraw();
}

export function onFirstReplayAction(firstReplayAction: boolean) {
  // The in-game replay button starts off disabled
  // Enable it once there is at least one segment to rewind to
  globals.elements.replayButton!.setEnabled(firstReplayAction);
  globals.layers.UI.batchDraw();
}
