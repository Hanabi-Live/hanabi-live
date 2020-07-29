import State from '../../../types/State';
import globals from '../../globals';
import * as hypothetical from '../../hypothetical';
import * as turn from '../../turn';

export const onHypotheticalEnterExit = (started: boolean, previousStarted: boolean | undefined) => {
  if (previousStarted === undefined) {
    return;
  }

  if (started) {
    hypoStarted();
  } else {
    hypoEnded();
  }
};

const hypoStarted = () => {
  const state = globals.store!.getState();
  if (state.replay.hypothetical === null) {
    return;
  }

  globals.elements.replayArea!.hide();

  // We toggle all of the UI elements relating to hypotheticals in case the shared replay leader
  // changes in the middle of a hypothetical
  if (globals.metadata.playerNames.length !== 2) {
    globals.elements.clueTargetButtonGroup!.hide();
    globals.elements.clueTargetButtonGroup2!.show();
  }
  globals.elements.restartButton!.hide();

  // These elements are visible only for the leader
  globals.elements.endHypotheticalButton!.visible(globals.amSharedReplayLeader);
  globals.elements.hypoBackButton!.visible((
    globals.amSharedReplayLeader
    && state.replay.hypothetical.states.length > 1
  ));
  globals.elements.toggleRevealedButton!.visible(globals.amSharedReplayLeader);
  globals.elements.clueArea!.visible(globals.amSharedReplayLeader);

  // This element is visible only for followers
  globals.elements.hypoCircle!.visible(!globals.amSharedReplayLeader);

  if (!globals.amSharedReplayLeader) {
    hypothetical.checkSetDraggableAllHands();
  }

  globals.layers.UI.batchDraw();

  hypothetical.beginTurn();
};

const hypoEnded = () => {
  if (globals.amSharedReplayLeader) {
    hypothetical.checkSetDraggableAllHands();
    turn.hideClueUIAndDisableDragging();

    globals.elements.restartButton!.show();
    globals.elements.endHypotheticalButton!.hide();
    globals.elements.hypoBackButton!.hide();
    globals.elements.toggleRevealedButton!.hide();
  } else {
    globals.elements.hypoCircle!.hide();
  }

  globals.elements.replayArea!.show();

  globals.layers.UI.batchDraw();
};

// For replay leaders, we want to disable entering a hypothetical during certain situations
export const enterHypoButtonIsEnabled = (state: State): boolean => (
  state.metadata.finished
  && globals.amSharedReplayLeader
  && state.replay.useSharedSegments
  // We can't start a hypothetical on a segment where the game has already ended
  && state.visibleState!.turn.currentPlayerIndex !== null
);

export const enterHypoButtonEnabledChanged = (enabled: boolean) => {
  globals.elements.enterHypoButton!.setEnabled(enabled);
  globals.layers.UI.batchDraw();
};
