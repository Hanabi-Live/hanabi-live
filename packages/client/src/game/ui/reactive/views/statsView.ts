import type { NumPlayers, PaceRisk, StatsState } from "@hanabi-live/game";
import { assertDefined } from "complete-common";
import {
  formatEfficiency,
  getEfficiencyStats,
  getEfficiencyTooltip,
  getMaxTurns,
  getMaxTurnsTooltip,
  shouldModifyEfficiency,
} from "../../../efficiency.ts";
import { globals } from "../../UiGlobals.ts";
import { LABEL_COLOR, MODIFIED_EFFICIENCY_COLOR } from "../../constants.ts";
import { setKonvaTooltipContent } from "../../konvaTooltips.ts";
import { getPaceRiskColor } from "../../paceRiskColor.ts";

/** Updates the labels on the right-hand side of the screen. */
export function onEfficiencyChanged(data: {
  stats: StatsState;
  efficiencyModifier: number;
}): void {
  const effLabel = globals.elements.efficiencyNumberLabel!;
  const effPipeLabel = globals.elements.efficiencyPipeLabel!;
  const effMinLabel = globals.elements.efficiencyMinNeededLabel!;

  const stats = getEfficiencyStats(
    data.stats,
    data.efficiencyModifier,
    shouldModifyEfficiency(globals.state),
  );

  // There is no efficiency when there are 0 possible clues remaining or the game has ended.
  effLabel.text(formatEfficiency(stats.futureEfficiency));

  const text = effLabel.text();
  const { width } = effLabel.measureSize(text);
  effLabel.width(width);

  // Reposition the two labels to the right of the efficiency label so that they are aligned
  // properly.
  const effLabelSize = effLabel.measureSize(effLabel.text()).width;
  const pipeX = effLabel.x() + effLabelSize;
  effPipeLabel.x(pipeX);

  const effPipeLabelSize = effPipeLabel.measureSize(effPipeLabel.text()).width;
  const minEffX = pipeX + effPipeLabelSize;
  effMinLabel.x(minEffX);

  // Change the color of the efficiency label if there is a custom modification (e.g. to account for
  // a card that is Finessed).
  effLabel.fill(stats.modified ? MODIFIED_EFFICIENCY_COLOR : LABEL_COLOR);

  setKonvaTooltipContent(
    effLabel,
    getEfficiencyTooltip(
      stats,
      "Click / Double tap this number to add a modifier.",
    ),
    false,
  );

  globals.layers.UI.batchDraw();
}

export function onPaceOrPaceRiskChanged(data: {
  pace: number | undefined;
  paceRisk: PaceRisk;
  finalRoundEffectivelyStarted: boolean;
}): void {
  const label = globals.elements.paceNumberLabel;
  assertDefined(label, "paceNumberLabel is not initialized.");

  // Update the pace. (Part of the efficiency statistics on the right-hand side of the screen.) If
  // there are no cards left in the deck, pace is meaningless.
  if (
    data.pace === undefined
    || data.finalRoundEffectivelyStarted
    || globals.options.allOrNothing
  ) {
    label.text("-");
    label.fill(LABEL_COLOR);
  } else {
    let paceText = data.pace.toString();
    if (data.pace > 0) {
      paceText = `+${data.pace}`;
    }
    label.text(paceText);

    // Color the pace label depending on how "risky" it would be to discard (approximately).
    const color = getPaceLabelColor(data.paceRisk);
    label.fill(color);
  }

  globals.layers.UI.batchDraw();
}

function getPaceLabelColor(paceRisk: PaceRisk): string {
  return getPaceRiskColor(paceRisk) ?? LABEL_COLOR;
}

export function onMaxTurnsChanged(data: {
  stats: StatsState;
  score: number;
  turnNum: number;
  endTurnNum: number | undefined;
  numPlayers: NumPlayers;
}): void {
  const label = globals.elements.turnNumberLabel;
  assertDefined(label, "turnNumberLabel is not initialized.");

  const maxTurns = getMaxTurns(
    data.stats,
    data.score,
    data.turnNum,
    data.endTurnNum,
    data.numPlayers,
  );
  setKonvaTooltipContent(
    label,
    getMaxTurnsTooltip(maxTurns, data.turnNum),
    false,
  );
}
