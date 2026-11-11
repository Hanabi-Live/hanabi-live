import { parseIntSafe } from "complete-common";
import type Konva from "konva";
import * as modals from "../../modals.ts";
import { getHtmlElement, getHtmlInputElement } from "../../utils.ts";
import { globals } from "./UiGlobals.ts";
import * as arrows from "./arrows.ts";
import { RIGHT_MOUSE_BUTTON } from "./constants.ts";
import type { TextWithTooltip } from "./controls/TextWithTooltip.ts";

const setModifierButton = getHtmlElement("#set-modifier-button");
const setModifierCurrent = getHtmlElement("#set-modifier-current");
const setModifierNew = getHtmlInputElement("#set-modifier-new");

export function setEfficiencyModifier(efficiencyModifier: number): void {
  globals.store!.dispatch({
    type: "setEfficiencyModifier",
    efficiencyModifier,
  });

  if (globals.state.visibleState === undefined) {
    return;
  }

  if (
    globals.state.replay.shared !== undefined
    && globals.state.replay.shared.amLeader
  ) {
    globals.lobby.conn!.send("replayAction", {
      tableId: globals.lobby.joinedTableId,
      action: {
        type: "efficiencyModifier",
        efficiencyModifier,
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
  if (globals.state.replay.active && !globals.state.finished) {
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

  setModifierCurrent.textContent = currentModifier.toString();
  setModifierNew.value = currentModifier.toString();

  // We can't use "addEventListener" because we can't easily remove the previous listener.
  // eslint-disable-next-line unicorn/prefer-add-event-listener
  setModifierButton.onclick = () => {
    modals.closeModals();

    const efficiencyModifierString = setModifierNew.value;
    const efficiencyModifier = parseIntSafe(efficiencyModifierString);
    if (efficiencyModifier === undefined) {
      // Do not do anything if they entered something that is not a number.
      return;
    }
    setEfficiencyModifier(efficiencyModifier);
  };

  modals.showPrompt(
    "#set-modifier-modal",
    undefined,
    setModifierNew,
    setModifierButton,
  );
}
