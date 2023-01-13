import Konva from "konva";
import { Button } from "./controls/Button";
import { EnterHypoButton } from "./controls/EnterHypoButton";
import { SharedTurnsButton } from "./controls/SharedTurnsButton";
import { Shuttle } from "./controls/Shuttle";
import { globals } from "./globals";
import * as hypothetical from "./hypothetical";
import * as replay from "./replay";

export function drawReplayArea(winW: number, winH: number): void {
  const replayAreaValues = {
    x: 0.15,
    y: 0.51,
    w: 0.5,
  };
  if (!globals.lobby.settings.keldonMode) {
    replayAreaValues.x = 0.01;
    replayAreaValues.y = 0.49;
    replayAreaValues.w = 0.4;
  }

  globals.elements.replayArea = new Konva.Group({
    x: replayAreaValues.x * winW,
    y: replayAreaValues.y * winH,
    width: replayAreaValues.w * winW,
    height: 0.27 * winH,
    visible: false,
    listening: false,
  });

  // The thin black rectangle that the replay slider slides on.
  const replayBarValues = {
    x: globals.lobby.settings.keldonMode ? 0.01 : 0,
    y: 0.0425,
    w: globals.lobby.settings.keldonMode ? 0.481 : replayAreaValues.w,
    h: 0.01,
  };
  globals.elements.replayBar = new Konva.Rect({
    x: replayBarValues.x * winW,
    y: replayBarValues.y * winH,
    width: replayBarValues.w * winW,
    height: replayBarValues.h * winH,
    fill: "black",
    cornerRadius: 0.005 * winH,
    listening: false,
  });
  globals.elements.replayArea.add(globals.elements.replayBar);

  // An invisible rectangle over the visible black rectangle above (which is slightly bigger so that
  // it is easier to click on).
  const replayBarClickRect = new Konva.Rect({
    x: replayBarValues.x * winW,
    y: 0,
    width: replayBarValues.w * winW,
    height: 0.07 * winH,
    listening: true,
  });
  replayBarClickRect.on("click tap", replay.barClick);
  replayBarClickRect.on("wheel", replay.barScroll);
  globals.elements.replayArea.add(replayBarClickRect);

  const shuttleValues = {
    w: 0.03,
    h: 0.03,
    cornerRadius: 0.01,
    stroke: "black",
    strokeWidth: 0.001217,
    scale: 0.75,
  };

  // The shared (white) replay shuttle. (We want it to be behind the normal replay shuttle, so we
  // define it first.)
  globals.elements.replayShuttleShared = new Shuttle({
    width: shuttleValues.w * winW,
    height: shuttleValues.h * winH,
    offset: {
      x: (shuttleValues.w / 2) * winW,
      y: (shuttleValues.h / 2) * winW,
    },
    cornerRadius: shuttleValues.cornerRadius * winW,
    fill: "#d1d1d1", // Gray
    stroke: shuttleValues.stroke,
    strokeWidth: shuttleValues.strokeWidth * winW,
    visible: false,
    listening: true,
  });
  globals.elements.replayShuttleShared.on("click tap", () => {
    if (globals.state.replay.shared !== null) {
      replay.goToSegment(globals.state.replay.shared.segment, true);
    }
  });
  globals.elements.replayArea.add(globals.elements.replayShuttleShared);

  // This is the normal (blue) replay shuttle.
  globals.elements.replayShuttle = new Shuttle({
    width: shuttleValues.w * winW,
    height: shuttleValues.h * winH,
    offset: {
      x: (shuttleValues.w / 2) * winW,
      y: (shuttleValues.h / 2) * winW,
    },
    cornerRadius: shuttleValues.cornerRadius * winW,
    fill: "#0000cc", // Blue
    draggable: true,
    dragBoundFunc: replay.shuttleDragBound,
    stroke: shuttleValues.stroke,
    strokeWidth: shuttleValues.strokeWidth * winW,
    listening: true,
  });
  globals.elements.replayShuttle.on("dragmove", replay.shuttleDragMove);
  globals.elements.replayShuttle.on("wheel", replay.barScroll);
  globals.elements.replayArea.add(globals.elements.replayShuttle);

  const replayButtonValues = {
    x: 0.05,
    y: 0.07,
    w: 0.06,
    h: 0.08,
    spacing: 0.02,
  };
  if (globals.lobby.settings.keldonMode) {
    replayButtonValues.x = 0.1;
  }

  {
    let { x } = replayButtonValues;

    // Go back to the beginning (the left-most button).
    globals.elements.replayBackFullButton = new Button(
      {
        x: x * winW,
        y: 0.07 * winH,
        width: replayButtonValues.w * winW,
        height: replayButtonValues.h * winH,
        listening: true,
      },
      [
        globals.imageLoader!.get("replay-back-full")!,
        globals.imageLoader!.get("replay-back-full-disabled")!,
      ],
    );
    globals.elements.replayBackFullButton.on("click tap", replay.backFull);
    globals.elements.replayArea.add(
      globals.elements.replayBackFullButton as unknown as Konva.Group,
    );

    // Go back one turn (the second left-most button).
    x += replayButtonValues.w + replayButtonValues.spacing;
    globals.elements.replayBackButton = new Button(
      {
        x: x * winW,
        y: 0.07 * winH,
        width: replayButtonValues.w * winW,
        height: replayButtonValues.h * winH,
      },
      [
        globals.imageLoader!.get("replay-back")!,
        globals.imageLoader!.get("replay-back-disabled")!,
      ],
    );
    globals.elements.replayBackButton.on("click tap", () => {
      // Prevent accidental double clicks.
      if (Date.now() - globals.UIClickTime < 50) {
        return;
      }
      globals.UIClickTime = Date.now();

      replay.back();
    });
    globals.elements.replayArea.add(
      globals.elements.replayBackButton as unknown as Konva.Group,
    );

    // Go forward one turn (the second right-most button).
    x += replayButtonValues.w + replayButtonValues.spacing;
    globals.elements.replayForwardButton = new Button(
      {
        x: x * winW,
        y: 0.07 * winH,
        width: replayButtonValues.w * winW,
        height: replayButtonValues.h * winH,
      },
      [
        globals.imageLoader!.get("replay-forward")!,
        globals.imageLoader!.get("replay-forward-disabled")!,
      ],
    );
    globals.elements.replayForwardButton.on("click tap", () => {
      // Prevent accidental double clicks.
      if (Date.now() - globals.UIClickTime < 50) {
        return;
      }
      globals.UIClickTime = Date.now();

      replay.forward();
    });
    globals.elements.replayArea.add(
      globals.elements.replayForwardButton as unknown as Konva.Group,
    );

    // Go forward to the end (the right-most button).
    x += replayButtonValues.w + replayButtonValues.spacing;
    globals.elements.replayForwardFullButton = new Button(
      {
        x: x * winW,
        y: 0.07 * winH,
        width: replayButtonValues.w * winW,
        height: replayButtonValues.h * winH,
      },
      [
        globals.imageLoader!.get("replay-forward-full")!,
        globals.imageLoader!.get("replay-forward-full-disabled")!,
      ],
    );
    globals.elements.replayForwardFullButton.on(
      "click tap",
      replay.forwardFull,
    );
    globals.elements.replayArea.add(
      globals.elements.replayForwardFullButton as unknown as Konva.Group,
    );
  }

  const extra = 0.04;
  const totalWidth = replayButtonValues.w * 4 + replayButtonValues.spacing * 3;
  const bottomButtonValues = {
    y: 0.17,
    w: replayButtonValues.w * 2 + replayButtonValues.spacing + extra,
    h: 0.06,
  };
  const bottomLeftReplayButtonX = replayButtonValues.x - extra;
  const bottomCenterReplayButtonX =
    replayButtonValues.x + (totalWidth - bottomButtonValues.w) / 2;
  const bottomRightReplayButtonX =
    replayButtonValues.x +
    replayButtonValues.w * 2 +
    replayButtonValues.spacing * 2;
  // The "Exit Replay" button.
  globals.elements.replayExitButton = new Button({
    x: bottomRightReplayButtonX * winW,
    y: bottomButtonValues.y * winH,
    width: bottomButtonValues.w * winW,
    height: replayButtonValues.w * winH,
    text: "Exit Replay",
    visible: !globals.state.finished,
  });
  globals.elements.replayExitButton.on("click tap", replay.exitButton);
  globals.elements.replayArea.add(
    globals.elements.replayExitButton as unknown as Konva.Group,
  );

  // The next two buttons will be moved to the left for replay leaders and centered for
  // non-replay-leaders.
  function setCenter(this: SharedTurnsButton) {
    this.x(bottomCenterReplayButtonX * winW);
  }
  function setLeft(this: SharedTurnsButton) {
    this.x(bottomLeftReplayButtonX * winW);
  }

  // The "Pause Shared Turns" button. (This will be shown when the client receives the
  // "replayLeader" command.)
  globals.elements.pauseSharedTurnsButton = new SharedTurnsButton({
    y: bottomButtonValues.y * winH,
    width: bottomButtonValues.w * winW,
    height: bottomButtonValues.h * winH,
    text: "Pause Shared Turns",
    visible: false,
  });
  globals.elements.pauseSharedTurnsButton.on(
    "click tap",
    replay.toggleSharedSegments,
  );
  globals.elements.pauseSharedTurnsButton.setCenter = setCenter;
  globals.elements.pauseSharedTurnsButton.setCenter(); // Set it to be center by default
  globals.elements.pauseSharedTurnsButton.setLeft = setLeft;
  globals.elements.replayArea.add(
    globals.elements.pauseSharedTurnsButton as unknown as Konva.Group,
  );

  // The "Use Shared Turns" button. (This will be shown when the client receives the "replayLeader"
  // command.)
  globals.elements.useSharedTurnsButton = new SharedTurnsButton({
    y: bottomButtonValues.y * winH,
    width: bottomButtonValues.w * winW,
    height: bottomButtonValues.h * winH,
    text: "Use Shared Turns",
    visible: false,
  });
  globals.elements.useSharedTurnsButton.on(
    "click tap",
    replay.toggleSharedSegments,
  );
  globals.elements.useSharedTurnsButton.setCenter = setCenter;
  globals.elements.useSharedTurnsButton.setCenter(); // Set it to be center by default
  globals.elements.useSharedTurnsButton.setLeft = setLeft;
  globals.elements.replayArea.add(
    globals.elements.useSharedTurnsButton as unknown as Konva.Group,
  );

  // The "Enter Hypothetical" button.
  globals.elements.enterHypoButton = new EnterHypoButton({
    y: bottomButtonValues.y * winH,
    width: bottomButtonValues.w * winW,
    height: bottomButtonValues.h * winH,
    text: "Enter Hypothetical",
  });
  globals.elements.enterHypoButton.on("click tap", hypothetical.start);
  globals.elements.replayArea.add(
    globals.elements.enterHypoButton as unknown as Konva.Group,
  );

  // This button will be moved to the left during in-game replay, centered during private replay,
  // and right during shared replay.

  function enterHypoSetLeft(this: EnterHypoButton) {
    this.x(bottomLeftReplayButtonX * winW);
  }
  function enterHypoSetCenter(this: EnterHypoButton) {
    this.x(bottomCenterReplayButtonX * winW);
  }
  function enterHypoSetRight(this: EnterHypoButton) {
    this.x(bottomRightReplayButtonX * winW);
  }

  globals.elements.enterHypoButton.setLeft = enterHypoSetLeft;
  globals.elements.enterHypoButton.setCenter = enterHypoSetCenter;
  globals.elements.enterHypoButton.setRight = enterHypoSetRight;

  // Add the replay area to the UI.
  globals.layers.UI.add(globals.elements.replayArea);
  replay.adjustShuttles(true); // Skip the animation
}
