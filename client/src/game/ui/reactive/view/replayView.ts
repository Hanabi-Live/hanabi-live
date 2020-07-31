import { variantRules } from '../../../rules';
import ReplayActionType from '../../../types/ReplayActionType';
import globals from '../../globals';
import isOurTurn from '../../isOurTurn';
import * as ourHand from '../../ourHand';
import * as replay from '../../replay';
import * as timer from '../../timer';
import * as tooltips from '../../tooltips';
import * as turn from '../../turn';

export const onActiveChanged = (active: boolean) => {
  // Local variables
  const state = globals.store!.getState();

  if (active) {
    // Hide the UI elements that overlap with the replay area
    turn.hideClueUIAndDisableDragging();

    // Next, show the replay area and initialize some UI elements
    globals.elements.replayArea!.show();
    replay.adjustShuttles(true); // We want it to immediately snap to the end
  } else {
    // We are exiting a replay
    globals.elements.replayArea!.hide();
    if (state.premove !== null) {
      globals.elements.premoveCancelButton!.show();
    }
    if (isOurTurn()) {
      turn.showClueUI();
    }
  }

  ourHand.checkSetDraggableAll();

  globals.layers.UI.batchDraw();
};

export const onActiveOrOngoingGameSegmentChanged = (data: {
  active: boolean;
  ongoingGameSegment: number | null;
}) => {
  if (!data.active || data.ongoingGameSegment === null) {
    return;
  }

  // We need to update the replay slider, based on the new amount of segments
  replay.adjustShuttles(false);

  // If we are on the last segment, disable the forward replay buttons
  const enabled = globals.store!.getState().replay.segment !== data.ongoingGameSegment;
  globals.elements.replayForwardButton!.setEnabled(enabled);
  globals.elements.replayForwardFullButton!.setEnabled(enabled);

  globals.layers.UI.batchDraw();
};

export const onSecondRecordedSegment = (
  hasTwoOrMoreSegments: boolean,
  previousHasTwoOrMoreSegments: boolean | undefined,
) => {
  if (previousHasTwoOrMoreSegments === undefined) {
    return;
  }

  // The in-game replay button starts off disabled
  // Enable it once there is at least one segment to rewind to
  globals.elements.replayButton!.setEnabled(hasTwoOrMoreSegments);
  globals.layers.UI.batchDraw();
};

export const onReplaySegmentChanged = (
  segment: number,
  previousSegment: number | undefined,
) => {
  // Local variables
  const state = globals.store!.getState();

  if (previousSegment === undefined || segment === null || !state.replay.active) {
    return;
  }

  // If we are on the first segment, disable the rewind replay buttons
  globals.elements.replayBackFullButton!.setEnabled(segment !== 0);
  globals.elements.replayBackButton!.setEnabled(segment !== 0);

  // If we are on the last segment, disable the forward replay buttons
  const finalSegment = state.ongoingGame.turn.segment!;
  globals.elements.replayForwardButton!.setEnabled(segment !== finalSegment);
  globals.elements.replayForwardFullButton!.setEnabled(segment !== finalSegment);

  // There are two replay shuttles,
  // so we have to adjust them whenever the "segment" or the "sharedSegment" changes
  replay.adjustShuttles(false);

  globals.layers.UI.batchDraw();
};

export const onSharedSegmentOrUseSharedSegmentsChanged = (data: {
  sharedSegment: number;
  useSharedSegments: boolean;
}, previousData: {
  sharedSegment: number;
  useSharedSegments: boolean;
} | undefined) => {
  // Local variables
  const state = globals.store!.getState();

  if (previousData === undefined || !state.replay.active || !globals.metadata.sharedReplay) {
    return;
  }

  if (data.useSharedSegments) {
    if (globals.amSharedReplayLeader) {
      // Tell the rest of the spectators to go to the turn that we are now on
      globals.lobby.conn!.send('replayAction', {
        tableID: globals.lobby.tableID,
        type: ReplayActionType.Segment,
        segment: data.sharedSegment,
      });
    } else {
      // Go to the turn where the shared replay leader is at
      // (we set force to true in case a hypothetical just started and we are being dragged to the
      // starting turn of the hypothetical)
      replay.goToSegment(data.sharedSegment, false, true);

      // In shared replays, it can be confusing as to what the shared replay leader is doing,
      // so play an appropriate animations to indicate what is going on
      // (and cancel the other tween if it is going)
      // Don't play it though if we are resuming shared segments
      // (e.g. going back to where the shared replay leader is)
      if (data.useSharedSegments === previousData.useSharedSegments) {
        if (data.sharedSegment < previousData.sharedSegment) {
          globals.elements.sharedReplayForwardTween!.reset();
          globals.elements.sharedReplayBackwardTween!.play();
        } else if (data.sharedSegment > previousData.sharedSegment) {
          globals.elements.sharedReplayBackwardTween!.reset();
          globals.elements.sharedReplayForwardTween!.play();
        }
      }
    }
  }

  globals.elements.pauseSharedTurnsButton!.visible(data.useSharedSegments);
  globals.elements.useSharedTurnsButton!.visible(!data.useSharedSegments);

  // There are two replay shuttles,
  // so we have to adjust them whenever the "segment" or the "sharedSegment" changes
  replay.adjustShuttles(false);

  globals.layers.UI.batchDraw();
};

export const onFinishedChanged = (finished: boolean, previousFinished: boolean | undefined) => {
  if (previousFinished === undefined || !finished) {
    return;
  }

  // If any tooltips are open, close them
  tooltips.resetActiveHover();

  // If the timers are showing, hide them
  if (globals.elements.timer1) {
    globals.elements.timer1.hide();
  }
  if (globals.elements.timer2) {
    globals.elements.timer2.hide();
  }
  timer.stop();

  // Transform this game into a shared replay
  globals.metadata.replay = true;
  globals.metadata.sharedReplay = true;

  // Hide the "Exit Replay" button in the center of the screen, since it is no longer necessary
  globals.elements.replayExitButton!.hide();

  // Hide/show some buttons in the bottom-left-hand corner
  globals.elements.replayButton!.hide();
  globals.elements.killButton!.hide();
  globals.elements.lobbyButtonSmall!.hide();
  globals.elements.lobbyButtonBig!.show();

  // Re-draw the deck tooltip
  // (it will show more information when you are in a replay)
  globals.metadata.datetimeFinished = new Date();
  globals.elements.deck!.initTooltip();

  // Turn off the "Throw It in a Hole" UI
  if (variantRules.isThrowItInAHole(globals.variant)) {
    globals.elements.scoreTextLabel!.show();
    globals.elements.scoreNumberLabel!.show();
    globals.elements.maxScoreNumberLabel!.show();
    globals.elements.playsTextLabel!.hide();
    globals.elements.playsNumberLabel!.hide();
    globals.elements.questionMarkLabels.forEach((label) => label.hide());
  }

  globals.layers.timer.batchDraw();
  globals.layers.UI.batchDraw();
};
