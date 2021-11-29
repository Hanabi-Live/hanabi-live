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

  const element = document.getElementById("set-modifier-current");
  if (element !== null) {
    element.innerHTML = currentModifier.toString();
  }
  document
    .getElementById("set-modifier-new")
    ?.setAttribute("value", currentModifier.toString());
  const button = <HTMLButtonElement>(
    document.getElementById("set-modifier-button")
  );
  console.log(`DIALOG: ${button}`);
  button.onpointerdown = () => {
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

  modals.showPrompt("#set-modifier-modal");
}
