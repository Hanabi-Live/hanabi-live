/* eslint-disable import/prefer-default-export */

import globals from '../../globals';
import isOurTurn from '../../isOurTurn';
import * as ourHand from '../../ourHand';
import * as replay from '../../replay';
import * as turn from '../../turn';

export function onActiveChanged(active: boolean, previousActive: boolean | undefined) {
  // Do not do anything on first initialization
  if (previousActive === undefined) {
    return;
  }

  if (active) {
    // We are entering a replay
    // Start by putting us at the end of the replay (the current game state)
    globals.inReplay = true;
    globals.replayPos = globals.replayLog.length;
    const finalSegment = globals.store!.getState().ongoingGame.turn.segment!;
    globals.replayTurn = finalSegment;

    // However, if the game just ended,
    // we want to go to the turn before the miscellaneous data sent at the end of the game
    if (globals.gameOver) {
      globals.replayPos = globals.finalReplayPos;
      globals.replayTurn = globals.finalReplayTurn;
    }

    // Hide the UI elements that overlap with the replay area
    turn.hideClueUIAndDisableDragging();

    // Next, show the replay area and initialize some UI elements
    globals.elements.replayArea!.show();
    replay.adjustShuttles(true); // We want it to immediately snap to the end
    globals.layers.UI.batchDraw();
  } else if (!active) {
    // We are exiting a replay
    const finalSegment = globals.store!.getState().ongoingGame.turn.segment!;
    replay.goto(finalSegment, true);
    globals.inReplay = false;

    globals.elements.replayArea!.hide();
    if (globals.store!.getState().premove !== null) {
      globals.elements.premoveCancelButton!.show();
    }
    if (isOurTurn()) {
      turn.showClueUI();
    }
  }

  ourHand.checkSetDraggableAll();

  globals.layers.UI.batchDraw();
}

export function onActiveOrOngoingGameSegmentChanged(data: {
  active: boolean;
  segment: number | null;
}) {
  if (!data.active) {
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
