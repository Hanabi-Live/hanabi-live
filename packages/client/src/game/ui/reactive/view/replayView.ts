import Konva from "konva";
import * as tooltips from "../../../../tooltips";
import * as variantRules from "../../../rules/variant";
import ReplayActionType from "../../../types/ReplayActionType";
import Spectator from "../../../types/Spectator";
import globals from "../../globals";
import * as konvaTooltips from "../../konvaTooltips";
import * as ourHand from "../../ourHand";
import * as replay from "../../replay";
import * as timer from "../../timer";

export function onActiveChanged(active: boolean): void {
  const { replayArea } = globals.elements;
  if (replayArea === null) {
    return;
  }
  replayArea.visible(active);

  if (active) {
    // Show the replay area and initialize some UI elements.
    replay.adjustShuttles(true); // We want it to immediately snap to the end
  } else if (globals.state.premove !== null) {
    // We are exiting a replay.
    globals.elements.premoveCancelButton?.show();
  }

  ourHand.checkSetDraggableAll();

  globals.layers.UI.batchDraw();
}

export function onSegmentChanged(
  data: {
    active: boolean;
    replaySegment: number | null;
    ongoingGameSegment: number | null;
  },
  previousData:
    | {
        active: boolean;
        replaySegment: number | null;
        ongoingGameSegment: number | null;
      }
    | undefined,
): void {
  if (data.replaySegment === null) {
    return;
  }

  // If we are on the first segment, disable the rewind replay buttons.
  const onFirstSegment = data.replaySegment !== 0;
  globals.elements.replayBackFullButton?.setEnabled(onFirstSegment);
  globals.elements.replayBackButton?.setEnabled(onFirstSegment);

  // If we are on the last segment, disable the forward replay buttons.
  const onFinalSegment = data.replaySegment !== data.ongoingGameSegment;
  globals.elements.replayForwardButton?.setEnabled(onFinalSegment);
  globals.elements.replayForwardFullButton?.setEnabled(onFinalSegment);

  if (
    previousData === undefined ||
    !data.active ||
    data.ongoingGameSegment === null
  ) {
    return;
  }

  // There are two replay shuttles, so we have to adjust them whenever the "segment" or the
  // "sharedSegment" changes.
  replay.adjustShuttles(false);

  globals.layers.UI.batchDraw();
}

export function onSharedSegmentChanged(
  data: {
    active: boolean;
    sharedSegment: number | undefined;
    useSharedSegments: boolean | undefined;
  },
  previousData:
    | {
        sharedSegment: number | undefined;
        useSharedSegments: boolean | undefined;
      }
    | undefined,
): void {
  if (
    !data.active ||
    data.sharedSegment === undefined ||
    data.useSharedSegments === undefined
  ) {
    return;
  }

  if (data.useSharedSegments) {
    if (globals.state.replay.shared!.amLeader) {
      // Tell the rest of the spectators to go to the turn that we are now on.
      globals.lobby.conn!.send("replayAction", {
        tableID: globals.lobby.tableID,
        type: ReplayActionType.Segment,
        segment: data.sharedSegment,
      });
    } else {
      // Go to the turn where the shared replay leader is at. (We set force to true in case a
      // hypothetical just started and we are being dragged to the starting turn of the
      // hypothetical.)
      replay.goToSegment(data.sharedSegment, false, true);

      if (
        previousData !== undefined &&
        previousData.sharedSegment !== undefined &&
        data.useSharedSegments === previousData.useSharedSegments
      ) {
        playSharedReplayTween(data.sharedSegment, previousData.sharedSegment);
      }
    }
  }

  globals.elements.pauseSharedTurnsButton?.visible(data.useSharedSegments);
  globals.elements.useSharedTurnsButton?.visible(!data.useSharedSegments);

  // There are two replay shuttles, so we have to adjust them whenever the "segment" or the
  // "sharedSegment" changes The first time we go into a shared replay, always animate fast. (The
  // condition is needed in case we are in an in-game replay when the game ends.)
  replay.adjustShuttles(
    previousData === undefined || previousData.sharedSegment === undefined,
  );

  globals.layers.UI.batchDraw();
}

export function onShouldShowReplayButtonChanged(shouldShow: boolean): void {
  globals.elements.replayButton?.visible(shouldShow);
}

export function enterHypoButtonLocationChanged(data: {
  finished: boolean;
  shared: boolean;
}): void {
  if (!data.finished) {
    globals.elements.enterHypoButton?.setLeft();
  } else if (!data.shared) {
    globals.elements.enterHypoButton?.setCenter();
  } else {
    globals.elements.enterHypoButton?.setRight();
  }
}

// In shared replays, it can be confusing as to what the shared replay leader is doing, so play an
// appropriate animations to indicate what is going on (and cancel the other tween if it is going).
// Don't play it though if we are resuming shared segments
// (e.g. going back to where the shared replay leader is).
function playSharedReplayTween(
  sharedSegment: number,
  previousSharedSegment: number,
) {
  const duration = 1;
  const opacity = 0;
  if (sharedSegment < previousSharedSegment) {
    globals.elements.sharedReplayBackward?.show();
    globals.elements.sharedReplayBackward?.opacity(1);
    if (globals.elements.sharedReplayBackwardTween !== null) {
      globals.elements.sharedReplayBackwardTween.destroy();
      globals.elements.sharedReplayBackwardTween = null;
    }
    globals.elements.sharedReplayBackwardTween = new Konva.Tween({
      node: globals.elements.sharedReplayBackward,
      duration,
      opacity,
    }).play();
  } else if (sharedSegment > previousSharedSegment) {
    globals.elements.sharedReplayForward?.show();
    globals.elements.sharedReplayForward?.opacity(1);
    if (globals.elements.sharedReplayForwardTween !== null) {
      globals.elements.sharedReplayForwardTween.destroy();
      globals.elements.sharedReplayForwardTween = null;
    }
    globals.elements.sharedReplayForwardTween = new Konva.Tween({
      node: globals.elements.sharedReplayForward,
      duration,
      opacity,
    }).play();
  }
}

export function onDatabaseIDChanged(databaseID: number | null): void {
  if (databaseID === null) {
    return;
  }

  let text: string;
  if (databaseID === 0) {
    // JSON replays are hard-coded to have a database ID of 0.
    text = "JSON replay";
  } else {
    text = `ID: ${databaseID}`;
  }
  globals.elements.gameIDLabel?.text(text);
  globals.elements.gameIDLabel?.show();

  // Also move the card count label on the deck downwards.
  if (globals.state.visibleState!.cardsRemainingInTheDeck === 0) {
    globals.elements.deck?.nudgeCountDownwards();
  }

  globals.layers.arrow.batchDraw(); // gameIDLabel is on the arrow layer
  globals.layers.card.batchDraw(); // deck is on the card layer
}

export function onFinishedChanged(
  finished: boolean,
  previousFinished: boolean | undefined,
): void {
  if (previousFinished === undefined || !finished) {
    return;
  }

  // If any tooltips are open, close them.
  konvaTooltips.resetActiveHover();

  // If the timers are showing, hide them.
  globals.elements.timer1?.hide();
  globals.elements.timer2?.hide();
  timer.stop();

  // Hide the "Exit Replay" button in the center of the screen, since it is no longer necessary.
  globals.elements.replayExitButton?.hide();

  // Hide/show some buttons in the bottom-left-hand corner.
  globals.elements.replayButton?.hide();

  // Hide the terminate button and show the 3rd strike UI.
  if (globals.elements.terminateButton !== null) {
    globals.elements.terminateButton.hide();
    globals.elements.strikeSquares[2]!.show();
    globals.elements.strikeXs[2]!.show();
  }

  // Re-draw the deck tooltip. (It will show more information when you are in a replay.)
  globals.elements.deck?.initDeckTooltip();

  // Turn off the "Throw It in a Hole" UI.
  if (variantRules.isThrowItInAHole(globals.variant)) {
    globals.elements.scoreTextLabel?.show();
    globals.elements.scoreNumberLabel?.show();
    globals.elements.maxScoreNumberLabel?.show();
    globals.elements.playsTextLabel?.hide();
    globals.elements.playsNumberLabel?.hide();
    globals.elements.questionMarkLabels.forEach((label) => label.hide());
  }

  globals.layers.timer.batchDraw();
  globals.layers.UI.batchDraw();
}

export function onSharedReplayEnter(sharedReplay: boolean): void {
  globals.elements.sharedReplayLeaderLabel?.visible(sharedReplay);
}

export function onSharedLeaderChanged(
  _leader: string,
  previousLeader: string | undefined,
): void {
  // Make the crown play an animation to indicate there is a new replay leader. (But don't play the
  // animation if the game just ended or we are first loading the page.)
  if (previousLeader !== undefined) {
    globals.elements.sharedReplayLeaderLabelPulse!.play();
  }
}

export function onSharedAmLeaderChanged(amLeader: boolean): void {
  globals.elements.sharedReplayLeaderCircle?.visible(amLeader);
  globals.elements.restartButton?.visible(amLeader);
  globals.elements.enterHypoButton?.visible(amLeader);

  // Arrange the buttons in the center of the screen in a certain way depending on whether we are
  // the shared replay leader.
  if (amLeader) {
    globals.elements.pauseSharedTurnsButton?.setLeft();
    globals.elements.useSharedTurnsButton?.setLeft();
  } else {
    globals.elements.pauseSharedTurnsButton?.setCenter();
    globals.elements.useSharedTurnsButton?.setCenter();
  }

  globals.layers.UI.batchDraw();
}

export function onLeaderOrSpectatorsChanged(data: {
  leader: string | undefined;
  spectators: Spectator[];
}): void {
  if (data.leader === undefined) {
    return;
  }

  // Find out if the leader is away.
  let away = true;
  for (const spectator of data.spectators) {
    if (spectator.name === data.leader) {
      away = false;
      break;
    }
  }

  // Update the tooltip
  let content = `<strong>Leader:</strong> ${data.leader}`;
  if (away) {
    content += " (away)";
  }
  tooltips.setInstanceContent("#tooltip-leader", content);
}
