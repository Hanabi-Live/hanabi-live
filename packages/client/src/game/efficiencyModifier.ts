// The player's manual change to the "cards currently gotten" of the efficiency, such as for a card
// that is finessed. Both game screens set it, and a shared replay leader sends it to the others.

import { MAX_EFFICIENCY_MODIFIER } from "@hanabi-live/data";
import { parseIntSafe } from "complete-common";
import { globals as lobbyGlobals } from "../Globals.ts";
import * as modals from "../modals.ts";
import { store } from "../store.ts";
import { currentState } from "./gameSession.ts";
import { gameUpdated } from "./gameSlice.ts";

export function setEfficiencyModifier(efficiencyModifier: number): void {
  store.dispatch(
    gameUpdated({
      type: "setEfficiencyModifier",
      efficiencyModifier,
    }),
  );

  const state = currentState();
  if (state.visibleState === undefined) {
    return;
  }

  if (state.replay.shared !== undefined && state.replay.shared.amLeader) {
    lobbyGlobals.connection.send("replayAction", {
      tableId: lobbyGlobals.joinedTableId,
      action: {
        type: "efficiency",
        modifier: efficiencyModifier,
      },
    });
  }
}

export function askForEfficiency(): void {
  const state = currentState();
  if (state.replay.segment !== undefined && !state.finished) {
    modals.showWarning(
      "You can not modify the future efficiency during in-game replays.",
    );
    return;
  }

  if (
    state.finished
    && state.replay.shared !== undefined
    && !state.replay.shared.amLeader
  ) {
    modals.showWarning(
      "Only the shared replay leader can modify the efficiency.",
    );
    return;
  }

  const currentModifier = state.notes.efficiencyModifier;

  modals.showPrompt(
    {
      type: "number",
      title: "Efficiency modifier",
      description:
        'Enter a number to add to the "cards currently gotten", such as 1 or -2.',
      current: {
        label: "Current modifier:",
        value: currentModifier.toString(),
      },
      label: "New modifier:",
      value: currentModifier.toString(),
      min: undefined,
      max: undefined,
    },
    (efficiencyModifierString) => {
      const efficiencyModifier = parseIntSafe(efficiencyModifierString);
      if (efficiencyModifier === undefined) {
        // Do not do anything if they entered something that is not a number.
        return;
      }
      if (Math.abs(efficiencyModifier) > MAX_EFFICIENCY_MODIFIER) {
        modals.showWarning(
          `The modifier must be between -${MAX_EFFICIENCY_MODIFIER} and ${MAX_EFFICIENCY_MODIFIER}.`,
        );
        return;
      }
      setEfficiencyModifier(efficiencyModifier);
    },
  );
}
