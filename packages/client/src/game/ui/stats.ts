import type Konva from "konva";
import * as modals from "../../modals";
import { ReplayActionType } from "../types/ReplayActionType";
import { ReplayArrowOrder } from "../types/ReplayArrowOrder";
import * as arrows from "./arrows";
import type { TextWithTooltip } from "./controls/TextWithTooltip";
import { globals } from "./globals";
import { parseIntSafe } from "@hanabi/data";

export function setEfficiencyMod(mod: number): void {
  globals.store!.dispatch({
    type: "setEffMod",
    mod,
  });

  if (globals.state.visibleState === null) {
    return;
  }

  if (
    globals.state.replay.shared !== null &&
    globals.state.replay.shared.amLeader
  ) {
    globals.lobby.conn!.send("replayAction", {
      tableID: globals.lobby.tableID,
      type: ReplayActionType.EfficiencyMod,
      value: mod,
    });
  }
}

export function efficiencyLabelClick(
  this: TextWithTooltip,
  event: Konva.KonvaEventObject<MouseEvent>,
): void {
  // "event.evt.buttons" is always 0 here.
  if (event.evt.button === 2) {
    arrows.click(event, ReplayArrowOrder.Efficiency);
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
    globals.state.finished &&
    globals.state.replay.shared !== null &&
    !globals.state.replay.shared.amLeader
  ) {
    modals.showWarning(
      "Only the shared replay leader can modify the efficiency.",
    );
    return;
  }

  const currentModifier = globals.state.notes.efficiencyModifier;

  const setModifierCurrent = document.querySelector("#set-modifier-current");
  if (setModifierCurrent === null) {
    throw new Error("#set-modifier-current does not exist.");
  }
  setModifierCurrent.innerHTML = currentModifier.toString();

  const setModifierNew = document.querySelector("#set-modifier-new");
  if (!(setModifierNew instanceof HTMLInputElement)) {
    throw new TypeError("#set-modifier-new was not a HTMLInputElement.");
  }
  setModifierNew.value = currentModifier.toString();

  const setModifierButton = document.querySelector("#set-modifier-button");
  if (!(setModifierButton instanceof HTMLButtonElement)) {
    throw new TypeError("#set-modifier-button was not a HTMLButtonElement.");
  }

  setModifierButton.addEventListener("click", clickSetModifierButton);
  modals.showPrompt(
    "#set-modifier-modal",
    undefined,
    setModifierNew,
    setModifierButton,
  );
}

function clickSetModifierButton() {
  modals.closeModals();

  const setModifierNew = document.querySelector("#set-modifier-new");
  if (!(setModifierNew instanceof HTMLInputElement)) {
    throw new TypeError("#set-modifier-new was not an HTMLInputElement.");
  }

  const effModString = setModifierNew.value;
  const effMod = parseIntSafe(effModString);
  if (Number.isNaN(effMod)) {
    // Don't do anything if they entered something that is not a number.
    return;
  }
  setEfficiencyMod(effMod);
}
