import State from '../../../types/State';
import PlayerButton from '../../controls/PlayerButton';
import globals from '../../globals';
import * as turn from '../../turn';

// For replay leaders, we want to disable entering a hypothetical during certain situations
export const shouldEnableEnterHypoButton = (state: State): boolean => (
  state.replay.shared !== null
  && state.replay.shared.useSharedSegments
  && state.replay.shared.amLeader
  // We can't start a hypothetical on a segment where the game has already ended
  && state.visibleState !== null
  && state.visibleState.turn.currentPlayerIndex !== null
);

export const shouldEnableEnterHypoButtonChanged = (enabled: boolean) => {
  globals.elements.enterHypoButton!.setEnabled(enabled);
  globals.layers.UI.batchDraw();
};

export const onActiveChanged = (active: boolean) => {
  if (globals.state.replay.shared === null) {
    return;
  }

  globals.elements.replayArea!.visible(!active);

  checkSetDraggableAllHands();

  if (active) {
    // We toggle all of the UI elements relating to hypotheticals in case the shared replay leader
    // changes in the middle of a hypothetical
    if (globals.options.numPlayers !== 2) {
      globals.elements.clueTargetButtonGroup!.hide();
      globals.elements.clueTargetButtonGroup2!.show();
    }
    globals.elements.restartButton!.visible(!active);
  }

  globals.layers.UI.batchDraw();
};

export const onActiveOrAmLeaderChanged = (data: {
  active: boolean;
  amLeader: boolean | undefined;
}) => {
  if (data.amLeader === undefined) {
    return;
  }

  const visibleForLeaderInHypo = data.active && data.amLeader;
  globals.elements.endHypotheticalButton!.visible(visibleForLeaderInHypo);
  globals.elements.toggleRevealedButton!.visible(visibleForLeaderInHypo);
  globals.elements.clueArea!.visible(visibleForLeaderInHypo);

  const visibleForFollowersInHypo = data.active && !data.amLeader;
  globals.elements.hypoCircle!.visible(visibleForFollowersInHypo);

  const visibleForLeaderOutOfHypo = !data.active && data.amLeader;
  globals.elements.restartButton!.visible(visibleForLeaderOutOfHypo);
  if (visibleForLeaderOutOfHypo) {
    turn.hideClueUIAndDisableDragging();
  }

  // We might to change the draggable property of a hand
  checkSetDraggableAllHands();
};

// Either we have entered a hypothetical, gone forward one action in a hypothetical,
// or gone back one action in a hypothetical
// Prepare the UI elements for the new turn
export const onStatesLengthChanged = () => {
  // Enable or disable the individual clue target buttons, depending on whose turn it is
  const buttonGroup = globals.elements.clueTargetButtonGroup2!;
  const buttons = buttonGroup.children.toArray() as PlayerButton[];
  for (const button of buttons) {
    button.setPressed(false);
    const currentPlayerIndex = globals.state.visibleState!.turn.currentPlayerIndex;
    const enabled = button.targetIndex !== currentPlayerIndex;
    button.setEnabled(enabled);

    // In 2-player games,
    // default the clue recipient button to the only other player available
    if (globals.options.numPlayers === 2 && enabled) {
      button.setPressed(true);
    }
  }

  turn.showClueUI();

  // Set the current player's hand to be draggable
  checkSetDraggableAllHands();
};

export const shouldShowHypoBackButton = (state: State): boolean => (
  state.replay.shared !== null
  && state.replay.shared.amLeader
  && state.replay.hypothetical !== null
  && state.replay.hypothetical.states.length > 1
);

export const shouldShowHypoBackButtonChanged = (enabled: boolean) => {
  globals.elements.hypoBackButton!.visible(enabled);
  globals.layers.UI.batchDraw();
};

const checkSetDraggableAllHands = () => {
  for (const hand of globals.elements.playerHands) {
    hand.checkSetDraggableAll();
  }
};
