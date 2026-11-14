import type { Spectator } from "@hanabi-live/data";
import Konva from "konva";
import * as tooltips from "../../../../tooltips.ts";
import { escapeHtml } from "../../../../utils.ts";
import type { SharedReplayState } from "../../../types/SharedReplayState.ts";
import type { State } from "../../../types/State.ts";
import * as replay from "../../replay.ts";
import * as restart from "../../restart.ts";
import * as timer from "../../timer.ts";
import { globals } from "../../UiGlobals.ts";
import { toggleZen } from "../../zen.ts";
import * as cluesView from "./cluesView.ts";

/** How long the shared replay forward and backward indicators take to fade out. */
const SHARED_REPLAY_INDICATOR_FADE_SECONDS = 1;

export function onActiveChanged(active: boolean): void {
  const { replayArea } = globals.elements;
  if (replayArea === undefined) {
    return;
  }

  if (active) {
    // Visibility is handled by hypotheticalView.shouldShowReplayAreaChanged.
    replay.adjustShuttles(true); // We want it to immediately snap to the end
  } else if (globals.state.premove !== undefined) {
    // We are exiting a replay.
    globals.elements.premoveCancelButton?.show();
  }

  cluesView.refreshArrows(active);

  globals.layers.UI.batchDraw();
}

export function onSegmentChanged(
  data: {
    active: boolean;
    replaySegment: number | undefined;
    ongoingGameSegment: number | undefined;
  },
  previousData:
    | {
        active: boolean;
        replaySegment: number | undefined;
        ongoingGameSegment: number | undefined;
      }
    | undefined,
): void {
  if (data.replaySegment === undefined) {
    return;
  }

  // If we are on the first segment, disable the rewind replay buttons.
  const onFirstSegment = data.replaySegment !== 0;
  globals.elements.replayBackFullButton?.setEnabled(onFirstSegment);
  globals.elements.replayBackButton?.setEnabled(onFirstSegment);

  // If we are on the last segment, disable the forward replay buttons.
  const onFinalSegment = data.replaySegment !== data.ongoingGameSegment;
  globals.elements.replayForwardButton?.setEnabled(onFinalSegment);
  globals.elements.replayForwardFullButton?.setEnabled(
    onFinalSegment && !replay.isSpoilerFree(),
  );

  if (
    previousData === undefined
    || !data.active
    || data.ongoingGameSegment === undefined
  ) {
    return;
  }

  const liveSegmentAdvanced =
    data.replaySegment === previousData.replaySegment
    && data.ongoingGameSegment !== previousData.ongoingGameSegment;

  // There are two replay shuttles, so we have to adjust them whenever the "segment" or the
  // "sharedSegment" changes. If only the live segment advanced while we are reviewing a replay,
  // snap instead of tweening to avoid re-animating the replay UI.
  replay.adjustShuttles(liveSegmentAdvanced);
  if (!liveSegmentAdvanced) {
    cluesView.refreshArrows(true);
  }

  globals.layers.UI.batchDraw();
}

export function onSharedSegmentChanged(
  data: {
    active: boolean;
    sharedSegment: number | undefined;
    useSharedSegments: boolean | undefined;
    amLeader: boolean | undefined;
  },
  previousData:
    | {
        active: boolean;
        sharedSegment: number | undefined;
        useSharedSegments: boolean | undefined;
        amLeader: boolean | undefined;
      }
    | undefined,
): void {
  if (
    !data.active
    || data.sharedSegment === undefined
    || data.useSharedSegments === undefined
  ) {
    return;
  }

  // "gameObservers.ts" sends the leader's turn and takes the spectators to it. When the leader
  // moves, the spectators see which way.
  if (
    data.useSharedSegments
    && data.amLeader !== true
    && previousData !== undefined
    && previousData.sharedSegment !== undefined
    && data.useSharedSegments === previousData.useSharedSegments
  ) {
    playSharedReplayTween(data.sharedSegment, previousData.sharedSegment);
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
  } else if (data.shared) {
    globals.elements.enterHypoButton?.setRight();
  } else {
    globals.elements.enterHypoButton?.setCenter();
  }
}

// In shared replays, it can be confusing as to what the shared replay leader is doing, so play an
// appropriate animations to indicate what is going on (and cancel the other tween if it is going).
// Do not play it though if we are resuming shared segments
// (e.g. going back to where the shared replay leader is).
function playSharedReplayTween(
  sharedSegment: number,
  previousSharedSegment: number,
) {
  const opacity = 0;
  if (sharedSegment < previousSharedSegment) {
    const indicator = globals.elements.sharedReplayBackward;
    if (indicator === undefined) {
      return;
    }
    indicator.show();
    indicator.opacity(1);
    if (globals.elements.sharedReplayBackwardTween !== undefined) {
      globals.elements.sharedReplayBackwardTween.destroy();
      globals.elements.sharedReplayBackwardTween = undefined;
    }
    globals.elements.sharedReplayBackwardTween = new Konva.Tween({
      node: indicator,
      duration: SHARED_REPLAY_INDICATOR_FADE_SECONDS,
      opacity,
    }).play();
  } else if (sharedSegment > previousSharedSegment) {
    const indicator = globals.elements.sharedReplayForward;
    if (indicator === undefined) {
      return;
    }
    indicator.show();
    indicator.opacity(1);
    if (globals.elements.sharedReplayForwardTween !== undefined) {
      globals.elements.sharedReplayForwardTween.destroy();
      globals.elements.sharedReplayForwardTween = undefined;
    }
    globals.elements.sharedReplayForwardTween = new Konva.Tween({
      node: indicator,
      duration: SHARED_REPLAY_INDICATOR_FADE_SECONDS,
      opacity,
    }).play();
  }
}

/** The label near the deck: the game's database ID, or nothing while the game is ongoing. */
export function getGameIdLabel(state: State): string | undefined {
  if (!state.finished) {
    return undefined;
  }

  return state.replay.gameId === undefined
    ? "JSON replay"
    : `ID: ${state.replay.gameId}`;
}

export function onGameIdLabelChanged(text: string | undefined): void {
  if (text === undefined) {
    return;
  }

  globals.elements.gameIdLabel?.text(text);
  globals.elements.gameIdLabel?.show();

  // Also move the card count label on the deck downwards.
  if (globals.state.visibleState!.cardsRemainingInTheDeck === 0) {
    globals.elements.deck?.nudgeCountDownwards();
  }

  globals.layers.arrow.batchDraw(); // gameIdLabel is on the arrow layer
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
  tooltips.closeAllTooltips();

  // If the timers are showing, hide them.
  globals.elements.timer1?.hide();
  globals.elements.timer2?.hide();
  timer.stop();

  // Hide the "Exit Replay" button in the center of the screen, since it is no longer necessary.
  globals.elements.replayExitButton?.hide();

  // Hide/show some buttons in the bottom-left-hand corner.
  globals.elements.replayButton?.hide();

  // Hide the terminate button and show the last strike UI.
  if (globals.elements.terminateButton !== undefined) {
    globals.elements.terminateButton.hide();
    globals.elements.terminateMenu?.close();
    globals.elements.strikeSquares.at(-1)!.show();
    globals.elements.strikeXs.at(-1)!.show();
  }

  // Re-draw the deck tooltip. (It will show more information when you are in a replay.)
  globals.elements.deck?.initDeckTooltip();

  // Turn off the "Throw It in a Hole" UI.
  if (globals.variant.throwItInAHole) {
    globals.elements.scoreTextLabel?.show();
    globals.elements.scoreNumberLabel?.show();
    globals.elements.maxScoreNumberLabel?.show();
    globals.elements.playsTextLabel?.hide();
    globals.elements.playsNumberLabel?.hide();
    globals.elements.holeCounter?.hide();
    for (const label of globals.elements.questionMarkLabels) {
      label.hide();
    }
  }

  // Disable zen mode
  toggleZen();

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
  // Make the crown play an animation to indicate there is a new replay leader. (But do not play the
  // animation if the game just ended or we are first loading the page.)
  if (previousLeader !== undefined) {
    globals.elements.sharedReplayLeaderLabelPulse?.play();
  }
}

/** Shows the leader whether they can restart, and the other players whether they declined. */
export function onRestartChanged(
  shared:
    | Pick<
        SharedReplayState,
        "leader" | "amLeader" | "canPlayAgain" | "restartDeclined"
      >
    | undefined,
): void {
  const { playerNames, ourUsername } = globals.metadata;
  const amLeader = shared?.amLeader === true;
  const canPlayAgain = shared?.canPlayAgain === true;
  const canRestart =
    shared !== undefined && restart.canRestart(shared, playerNames);
  globals.elements.restartButton?.visible(amLeader && canPlayAgain);

  const { readyCheckbox } = globals.elements;
  readyCheckbox?.visible(!amLeader && canPlayAgain);
  readyCheckbox?.setChecked(
    shared?.restartDeclined.includes(ourUsername) !== true,
  );

  const declined = shared === undefined ? [] : restart.declinedPlayers(shared);
  globals.elements.restartGameButton?.setEnabled(declined.length === 0);
  globals.elements.restartTableButton?.setEnabled(canRestart);
  globals.elements.restartText?.text(
    declined.length === 0 ? "" : `Not ready: ${declined.join(", ")}`,
  );

  globals.layers.UI.batchDraw();
  globals.layers.UI2.batchDraw();
}

export function onSharedAmLeaderChanged(amLeader: boolean): void {
  globals.elements.sharedReplayLeaderCircle?.visible(amLeader);
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
    if (spectator.username === data.leader) {
      away = false;
      break;
    }
  }

  // Update the tooltip
  let content = `<strong>Leader:</strong> ${escapeHtml(data.leader)}`;
  if (away) {
    content += " (away)";
  }
  tooltips.setContent("leader", content);
}

/** Paused spectators can see that the leader is in a hypothetical, and join it. */
export function onSharedHypotheticalChanged(active: boolean): void {
  globals.elements.useSharedTurnsButton?.text(
    active ? "Join Hypothetical" : "Use Shared Turns",
  );
  globals.layers.UI.batchDraw();
}
