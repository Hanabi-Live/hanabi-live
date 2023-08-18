import { parseIntSafe } from "@hanabi/utils";
import type Konva from "konva";
import * as modals from "../../modals";
import { getHTMLElement, getHTMLInputElement } from "../../utils";
import { ReplayActionType } from "../types/ReplayActionType";
import { ReplayArrowOrder } from "../types/ReplayArrowOrder";
import * as arrows from "./arrows";
import type { TextWithTooltip } from "./controls/TextWithTooltip";
import { globals } from "./globals";

const setModifierButton = getHTMLElement("#set-modifier-button");
const setModifierCurrent = getHTMLElement("#set-modifier-current");
const setModifierNew = getHTMLInputElement("#set-modifier-new");

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

  setModifierCurrent.innerHTML = currentModifier.toString();
  setModifierNew.value = currentModifier.toString();

  // We can't use "addEventListener" because we can't easily remove the previous listener.
  // eslint-disable-next-line unicorn/prefer-add-event-listener
  setModifierButton.onclick = () => {
    modals.closeModals();

    const effModString = setModifierNew.value;
    const effMod = parseIntSafe(effModString);
    if (effMod === undefined) {
      // Don't do anything if they entered something that is not a number.
      return;
    }
    setEfficiencyMod(effMod);
  };

  modals.showPrompt(
    "#set-modifier-modal",
    null,
    setModifierNew,
    setModifierButton,
  );
}
