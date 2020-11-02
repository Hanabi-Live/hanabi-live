/* eslint-disable import/prefer-default-export */

import Konva from "konva";
import { parseIntSafe } from "../../misc";
import * as modals from "../../modals";
import ReplayArrowOrder from "../types/ReplayArrowOrder";
import * as arrows from "./arrows";
import TextWithTooltip from "./controls/TextWithTooltip";
import globals from "./globals";
import * as statsView from "./reactive/view/statsView";

export function efficiencyLabelClick(
  this: TextWithTooltip,
  event: Konva.KonvaEventObject<MouseEvent>,
): void {
  // "event.evt.buttons" is always 0 here
  if (event.evt.button !== 2) {
    // We only care about right-clicks
    return;
  }
  if (event.evt.altKey) {
    if (globals.state.replay.active) {
      modals.warningShow(
        "You can not modify the future efficiency in replays.",
      );
      return;
    }

    const effModString = window.prompt(
      'Enter a modifier for the "cards currently gotten": (e.g. "1", "-2", etc.)',
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
    globals.efficiencyModifier = effMod;

    const ongoingGameStatsState = globals.state.ongoingGame.stats;
    statsView.onEfficiencyChanged({
      cardsGotten: ongoingGameStatsState.cardsGotten,
      potentialCluesLost: ongoingGameStatsState.potentialCluesLost,
      maxScore: ongoingGameStatsState.maxScore,
      cluesStillUsable: ongoingGameStatsState.cluesStillUsable,
    });
  } else {
    arrows.click(event, ReplayArrowOrder.Efficiency, this);
  }
}
