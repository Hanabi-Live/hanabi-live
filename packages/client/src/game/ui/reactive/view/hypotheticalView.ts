import type { State } from "../../../types/State";
import { globals } from "../../UIGlobals";
import * as clues from "../../clues";
import type { PlayerButton } from "../../controls/PlayerButton";
import { changeStartingHandVisibility } from "../../hypothetical";
import * as turn from "../../turn";

// For replay leaders, we want to disable entering a hypothetical during certain situations.
export function shouldEnableEnterHypoButton(state: State): boolean {
  return (
    (state.replay.shared === null && state.replay.active) ||
    (state.replay.shared !== null &&
      state.replay.shared.useSharedSegments &&
      state.replay.shared.amLeader &&
      // We can't start a hypothetical on a segment where the game has already ended.
      state.visibleState !== null &&
      state.visibleState.turn.currentPlayerIndex !== null)
  );
}

export function shouldEnableEnterHypoButtonChanged(enabled: boolean): void {
  globals.elements.enterHypoButton?.setEnabled(enabled);
  globals.layers.UI.batchDraw();
}

export function shouldShowReplayArea(state: State): boolean {
  return (
    (state.replay.active || state.replay.shared !== null) &&
    state.replay.hypothetical === null
  );
}

export function shouldShowReplayAreaChanged(shouldShow: boolean): void {
  globals.elements.replayArea?.visible(shouldShow);
  globals.layers.UI.batchDraw();
}

export function onActiveChanged(data: {
  hypotheticalActive: boolean;
  replayActive: boolean;
}): void {
  if (!data.hypotheticalActive && data.replayActive) {
    turn.hideArrowsAndDisableDragging();
  }

  checkSetDraggableAllHands();

  // We toggle all of the UI elements relating to hypotheticals in case the shared replay leader
  // changes in the middle of a hypothetical.
  globals.elements.clueTargetButtonGroup?.visible(
    globals.options.numPlayers !== 2 && !data.hypotheticalActive,
  );
  globals.elements.clueTargetButtonGroup2?.visible(
    globals.options.numPlayers !== 2 && data.hypotheticalActive,
  );

  globals.layers.UI.batchDraw();
}

export function shouldShowHypoControls(state: State): boolean {
  return (
    state.replay.hypothetical !== null &&
    (state.replay.shared === null || state.replay.shared.amLeader)
  );
}

export function shouldShowHypoControlsChanged(shouldShow: boolean): void {
  globals.elements.hypoButtonsArea?.visible(shouldShow);
  if (shouldShow) {
    // The lower part of the clue area and the "no clues" indicators slide left during
    // hypotheticals.
    globals.elements.lowerClueArea?.setLeft();
    globals.elements.clueAreaDisabled?.setLeft();
  } else {
    globals.elements.lowerClueArea?.setCenter();
    globals.elements.clueAreaDisabled?.setCenter();
  }
  // We might need to change the draggable property of a hand.
  checkSetDraggableAllHands();
  globals.layers.UI.batchDraw();
}

export function shouldShowToggleDrawnCards(state: State): boolean {
  return (
    state.finished &&
    state.replay.hypothetical !== null &&
    (state.replay.shared === null || state.replay.shared.amLeader)
  );
}

export function shouldShowToggleDrawnCardsChanged(shouldShow: boolean): void {
  globals.elements.toggleDrawnCardsButton?.setEnabled(shouldShow);
  globals.layers.UI.batchDraw();
}

export function onActiveOrAmLeaderChanged(data: {
  active: boolean;
  amLeader: boolean;
  sharedReplay: boolean;
}): void {
  const visibleForFollowersInHypo = data.active && !data.amLeader;
  globals.elements.hypoCircle?.visible(visibleForFollowersInHypo);

  if (visibleForFollowersInHypo) {
    turn.hideArrowsAndDisableDragging();
  }

  const visibleForLeaderInSharedReplay =
    !data.active && data.sharedReplay && data.amLeader;
  globals.elements.restartButton?.visible(visibleForLeaderInSharedReplay);

  globals.layers.UI.batchDraw();
}

// Either we have entered a hypothetical, gone forward one action in a hypothetical, or gone back
// one action in a hypothetical. Prepare the UI elements for the new turn.
export function onStatesLengthChanged(): void {
  turn.resetSelectedClue();

  // Enable or disable the individual clue target buttons, depending on whose turn it is.
  const buttonGroup = globals.elements.clueTargetButtonGroup2!;
  const buttons = buttonGroup.children.toArray() as PlayerButton[];
  for (const button of buttons) {
    button.setPressed(false);
    const { currentPlayerIndex } = globals.state.visibleState!.turn;
    const enabled = button.targetIndex !== currentPlayerIndex;
    button.setEnabled(enabled);

    // In 2-player games, default the clue recipient button to the only other player available.
    if (globals.options.numPlayers === 2 && enabled) {
      button.setPressed(true);
    }
  }

  // Set the current player's hand to be draggable.
  checkSetDraggableAllHands();

  globals.layers.UI.batchDraw();
}

export function shouldShowHypoBackButton(state: State): boolean {
  return (
    (state.replay.shared === null || state.replay.shared.amLeader) &&
    state.replay.hypothetical !== null &&
    state.replay.hypothetical.states.length > 1
  );
}

export function shouldShowHypoBackButtonChanged(enabled: boolean): void {
  globals.elements.hypoBackButton?.setEnabled(enabled);
  globals.layers.UI.batchDraw();
}

export function onDrawnCardsInHypotheticalChanged(
  drawnCardsInHypothetical: boolean,
): void {
  globals.elements.toggleDrawnCardsButton?.setPressed(drawnCardsInHypothetical);

  // Check if the ability to give a clue changed.
  clues.checkLegal();

  // Change starting player's hand visibility.
  changeStartingHandVisibility();

  globals.layers.UI.batchDraw();
}

function checkSetDraggableAllHands() {
  for (const hand of globals.elements.playerHands) {
    hand.checkSetDraggableAll();
  }
}
