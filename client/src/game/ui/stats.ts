/* eslint-disable import/prefer-default-export */

import Konva from "konva";
import { parseIntSafe } from "../../misc";
import * as modals from "../../modals";
import ReplayActionType from "../types/ReplayActionType";
import ReplayArrowOrder from "../types/ReplayArrowOrder";
import * as arrows from "./arrows";
import TextWithTooltip from "./controls/TextWithTooltip";
import globals from "./globals";

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
  // "event.evt.buttons" is always 0 here
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

  const current = document.getElementById("set-modifier-current");
  if (current !== null) {
    current.innerHTML = currentModifier.toString();
  }
  const element = <HTMLInputElement>document.getElementById("set-modifier-new");
  element.value = currentModifier.toString();

  const button = <HTMLButtonElement>(
    document.getElementById("set-modifier-button")
  );
  button.onclick = () => {
    modals.closeModals();

    const effModString =
      (<HTMLInputElement>document.getElementById("set-modifier-new"))?.value ??
      "";
    const effMod = parseIntSafe(effModString);
    if (Number.isNaN(effMod)) {
      // Don't do anything if they entered something that is not a number
      return;
    }
    setEfficiencyMod(effMod);
  };

  element.onkeydown = (event) => {
    if (event.key === "Enter") {
      button.click();
    }
  };

  modals.showPrompt("#set-modifier-modal");
  setTimeout(() => {
    element.focus();
    const length = element.value.length;
    // Cannot put the cursor past the text unless it's a text input
    element.type = "text";
    element.setSelectionRange(0, length);
    element.type = "number";
  }, 100);
}
