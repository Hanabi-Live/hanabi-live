import State from '../../../types/State';
import PlayerButton from '../../controls/PlayerButton';
import globals from '../../globals';
import * as turn from '../../turn';

export const onHypotheticalEnterExit = (active: boolean, previousActive: boolean | undefined) => {
  if (previousActive === undefined) {
    return;
  }

  if (active) {
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
    checkSetDraggableAllHands();
  }

  globals.layers.UI.batchDraw();
};

const hypoEnded = () => {
  if (globals.amSharedReplayLeader) {
    checkSetDraggableAllHands();
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

// Either we have entered a hypothetical, gone forward one action in a hypothetical,
// or gone back one action in a hypothetical
// Prepare the UI elements for the new turn
export const onStatesLengthChanged = () => {
  // Local variables
  const state = globals.store!.getState();
  if (state.replay.hypothetical === null || !globals.amSharedReplayLeader) {
    return;
  }

  // Enable or disable the individual clue target buttons, depending on whose turn it is
  const buttonGroup = globals.elements.clueTargetButtonGroup2!;
  const buttons = buttonGroup.children.toArray() as PlayerButton[];
  for (const button of buttons) {
    button.setPressed(false);
    const currentPlayerIndex = globals.store!.getState().visibleState!.turn.currentPlayerIndex;
    const enabled = button.targetIndex !== currentPlayerIndex;
    button.setEnabled(enabled);

    // In 2-player games,
    // default the clue recipient button to the only other player available
    if (globals.metadata.playerNames.length === 2 && enabled) {
      button.setPressed(true);
    }
  }

  turn.showClueUI();
  globals.elements.hypoBackButton!.visible(state.replay.hypothetical.states.length > 1);

  // Set the current player's hand to be draggable
  checkSetDraggableAllHands();
};

// For replay leaders, we want to disable entering a hypothetical during certain situations
export const enterHypoButtonIsEnabled = (state: State): boolean => (
  state.finished
  && globals.amSharedReplayLeader
  && state.replay.useSharedSegments
  // We can't start a hypothetical on a segment where the game has already ended
  && state.visibleState!.turn.currentPlayerIndex !== null
);

export const enterHypoButtonEnabledChanged = (enabled: boolean) => {
  globals.elements.enterHypoButton!.setEnabled(enabled);
  globals.layers.UI.batchDraw();
};

const checkSetDraggableAllHands = () => {
  for (const hand of globals.elements.playerHands) {
    hand.checkSetDraggableAll();
  }
};
