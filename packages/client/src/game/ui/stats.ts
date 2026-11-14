import { MAX_EFFICIENCY_MODIFIER } from "@hanabi-live/data";
import { parseIntSafe } from "complete-common";
import type Konva from "konva";
import { globals as lobbyGlobals } from "../../Globals.ts";
import * as modals from "../../modals.ts";
import { store } from "../../store.ts";
import { gameUpdated } from "../gameSlice.ts";
import { globals } from "./UiGlobals.ts";
import * as arrows from "./arrows.ts";
import { RIGHT_MOUSE_BUTTON } from "./constants.ts";
import type { TextWithTooltip } from "./controls/TextWithTooltip.ts";

export function setEfficiencyModifier(efficiencyModifier: number): void {
  store.dispatch(
    gameUpdated({
      type: "setEfficiencyModifier",
      efficiencyModifier,
    }),
  );

  if (globals.state.visibleState === undefined) {
    return;
  }

  if (
    globals.state.replay.shared !== undefined
    && globals.state.replay.shared.amLeader
  ) {
    lobbyGlobals.connection.send("replayAction", {
      tableId: lobbyGlobals.joinedTableId,
      action: {
        type: "efficiency",
        modifier: efficiencyModifier,
      },
    });
  }
}

export function efficiencyLabelClick(
  this: TextWithTooltip,
  event: Konva.KonvaEventObject<MouseEvent>,
): void {
  // "event.evt.buttons" is always 0 here.
  if (event.evt.button === RIGHT_MOUSE_BUTTON) {
    arrows.click(event, "efficiency");
    return;
  }

  askForEfficiency();
}

export function askForEfficiency(): void {
  if (globals.state.replay.segment !== undefined && !globals.state.finished) {
    modals.showWarning(
      "You can not modify the future efficiency during in-game replays.",
    );
    return;
  }

  if (
    globals.state.finished
    && globals.state.replay.shared !== undefined
    && !globals.state.replay.shared.amLeader
  ) {
    modals.showWarning(
      "Only the shared replay leader can modify the efficiency.",
    );
    return;
  }

  const currentModifier = globals.state.notes.efficiencyModifier;

  modals.showPrompt(
    {
      type: "number",
      title: "Set Modifier",
      description:
        'Enter a modifier for the "cards currently gotten". (e.g. "1", "-2", etc.)',
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
