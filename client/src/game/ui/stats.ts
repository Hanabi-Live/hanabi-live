/* eslint-disable import/prefer-default-export */

import Konva from "konva";
import { parseIntSafe } from "../../misc";
import * as modals from "../../modals";
import ReplayActionType from "../types/ReplayActionType";
import ReplayArrowOrder from "../types/ReplayArrowOrder";
import * as arrows from "./arrows";
import TextWithTooltip from "./controls/TextWithTooltip";
import globals from "./globals";
import * as statsView from "./reactive/view/statsView";

export function setEfficiencyMod(mod: number): void {
  globals.efficiencyModifier = mod;

  if (globals.state.visibleState === null) {
    return;
  }

  const ongoingGameState = globals.state.finished
    ? globals.state.visibleState
    : globals.state.ongoingGame;
  const ongoingGameStats = ongoingGameState.stats;
  statsView.onEfficiencyChanged({ ...ongoingGameStats });

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
  if (event.evt.button !== 2) {
    // We only care about right-clicks
    return;
  }

  // A normal right click is a arrow to highlight the efficiency
  if (!event.evt.altKey) {
    arrows.click(event, ReplayArrowOrder.Efficiency);
    return;
  }

  if (globals.state.replay.active && !globals.state.finished) {
    modals.warningShow(
      "You can not modify the future efficiency during in-game replays.",
    );
    return;
  }

  if (
    globals.state.finished &&
    globals.state.replay.shared !== null &&
    !globals.state.replay.shared.amLeader
  ) {
    modals.warningShow(
      "Only the shared replay leader can modify the efficiency.",
    );
    return;
  }

  const effModString = window.prompt(
    `The current modifier is: ${globals.efficiencyModifier}\nEnter a modifier for the "cards currently gotten".\n(e.g. "1", "-2", etc.)`,
  );
  if (effModString === null) {
    // Don't do anything if they pressed the cancel button
    return;
  }
  const effMod = parseIntSafe(effModString);
  if (Number.isNaN(effMod)) {
    // Don't do anything if they entered something that is not a number
    return;
  }

  setEfficiencyMod(effMod);
}
