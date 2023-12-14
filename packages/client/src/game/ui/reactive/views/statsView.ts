import type { NumPlayers } from "@hanabi/data";
import { PaceRisk } from "@hanabi/game";
import { assertNotNull } from "@hanabi/utils";
import * as statsRules from "../../../rules/stats";
import { globals } from "../../UIGlobals";
import { LABEL_COLOR } from "../../constants";
import * as konvaTooltips from "../../konvaTooltips";

/** Updates the labels on the right-hand side of the screen. */
export function onEfficiencyChanged(data: {
  cardsGotten: number;
  cardsGottenByNotes: number | null;
  efficiencyModifier: number;
  potentialCluesLost: number;
  maxScore: number;
  cluesStillUsableNotRounded: number | null;
  finalRoundEffectivelyStarted: boolean;
}): void {
  const cluesStillUsable =
    data.cluesStillUsableNotRounded === null
      ? null
      : Math.floor(data.cluesStillUsableNotRounded);

  const effLabel = globals.elements.efficiencyNumberLabel!;
  const effPipeLabel = globals.elements.efficiencyPipeLabel!;
  const effMinLabel = globals.elements.efficiencyMinNeededLabel!;

  // - If we are not currently using the shared segments, the shared efficiency modifier will not be
  //   applicable.
  // - Do not use the efficiency modifier during in-game replays.
  const shouldModifyEff = globals.state.finished
    ? globals.state.replay.shared !== null &&
      globals.state.replay.shared.useSharedSegments
    : globals.state.visibleState === globals.state.ongoingGame;

  let { cardsGotten, cardsGottenByNotes } = data;
  const { efficiencyModifier } = data;
  let cardsGottenModified = false;
  if (shouldModifyEff) {
    cardsGotten += efficiencyModifier;
    if (efficiencyModifier !== 0) {
      // The user has specified a manual efficiency modification
      // (e.g. to account for a card that is Finessed).
      cardsGottenModified = true;
    }
    if (cardsGottenByNotes !== null) {
      cardsGotten += cardsGottenByNotes;
    }
  } else {
    cardsGottenByNotes = null;
  }

  const cardsNotGotten = Math.max(data.maxScore - cardsGotten, 0);

  const efficiency = statsRules.efficiency(
    cardsGotten,
    data.potentialCluesLost,
  );
  const shouldShowEfficiency =
    Number.isFinite(efficiency) && !data.finalRoundEffectivelyStarted;
  const futureEfficiency =
    cluesStillUsable === null
      ? Number.NaN
      : statsRules.efficiency(cardsNotGotten, cluesStillUsable);
  const shouldShowFutureEfficiency = Number.isFinite(futureEfficiency);

  if (shouldShowFutureEfficiency) {
    // Show the efficiency and round it to 2 decimal places.
    effLabel.text(futureEfficiency.toFixed(2));
  } else {
    // Handle the case in which there are 0 possible clues remaining or the game has ended.
    effLabel.text("-");
  }

  const text = effLabel.text();
  const size = effLabel.measureSize(text);
  const width = size.width as number;
  effLabel.width(width);

  // Reposition the two labels to the right of the efficiency label so that they are aligned
  // properly. The type of Konva.Text.width is "any" for some reason.
  const effLabelSize = effLabel.measureSize(effLabel.text()).width as number;
  if (typeof effLabelSize !== "number") {
    throw new TypeError("The width of effLabel was not a number.");
  }
  const pipeX = effLabel.x() + effLabelSize;
  effPipeLabel.x(pipeX);

  // The type of Konva.Text.width is "any" for some reason.
  const effPipeLabelSize = effPipeLabel.measureSize(effPipeLabel.text())
    .width as number;
  if (typeof effPipeLabelSize !== "number") {
    throw new TypeError("The width of effPipeLabel was not a number.");
  }
  const minEffX = pipeX + effPipeLabelSize;
  effMinLabel.x(minEffX);

  // Change the color of the efficiency label if there is a custom modification.
  const effLabelColor = cardsGottenModified ? "#00ffff" : LABEL_COLOR;
  effLabel.fill(effLabelColor);

  // Update the tooltip
  const tooltipContent = `
    ${formatLine("Current cards gotten", data.cardsGotten, false)}
    ${formatLine(
      "Current cards noted as gotten",
      cardsGottenByNotes !== null && shouldModifyEff ? cardsGottenByNotes : "-",
    )}
    ${formatLine(
      "Current cards gotten modifier",
      shouldModifyEff ? efficiencyModifier : "-",
    )}
    ${formatLine("Potential clues lost", data.potentialCluesLost)}
    ${formatLine(
      "Current efficiency",
      shouldShowEfficiency ? efficiency.toFixed(2) : "-",
    )}
    <br />
    ${formatLine("Cards remaining to get", cardsNotGotten)}
    ${formatLine(
      "Remaining possible clues",
      data.cluesStillUsableNotRounded ?? "-",
    )}
    ${formatLine(
      "Future required efficiency",
      shouldShowFutureEfficiency ? futureEfficiency.toFixed(2) : "-",
    )}
    ${formatLine(
      "Number finesses required",
      cluesStillUsable !== null && shouldShowFutureEfficiency
        ? Math.max(cardsNotGotten - cluesStillUsable, 0)
        : "-",
    )}
    <br />
    Click / Double tap this number to add a modifier.
  `;
  effLabel.tooltipContent = tooltipContent;
  konvaTooltips.init(effLabel, true, false);

  globals.layers.UI.batchDraw();
}

function formatLine(left: string, right: number | string, usePadding = true) {
  const padding = usePadding ? "&nbsp; &nbsp; &nbsp; &nbsp; " : "";
  return `${padding}<span class="efficiency-description">${left}:</span> <strong>${right}</strong><br />`;
}

export function onPaceOrPaceRiskChanged(data: {
  pace: number | null;
  paceRisk: PaceRisk;
  finalRoundEffectivelyStarted: boolean;
}): void {
  const label = globals.elements.paceNumberLabel;
  assertNotNull(label, "paceNumberLabel is not initialized.");

  // Update the pace. (Part of the efficiency statistics on the right-hand side of the screen.) If
  // there are no cards left in the deck, pace is meaningless.
  if (
    data.pace === null ||
    data.finalRoundEffectivelyStarted ||
    globals.options.allOrNothing
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
  switch (paceRisk) {
    case PaceRisk.Low: {
      return LABEL_COLOR;
    }

    case PaceRisk.Medium: {
      return "#efef1d"; // Yellow
    }

    case PaceRisk.High: {
      return "#ef8c1d"; // Orange
    }

    case PaceRisk.Zero: {
      return "#df1c2d"; // Red
    }
  }
}

export function onMaxTurnsChanged(data: {
  pace: number | null;
  cluesStillUsable: number | null;
  score: number;
  maxScore: number;
  turnNum: number;
  endTurnNum: number | null;
  numPlayers: NumPlayers;
}): void {
  const {
    pace,
    cluesStillUsable,
    score,
    maxScore,
    turnNum,
    endTurnNum,
    numPlayers,
  } = data;
  let maxTurnsLeft: number;
  if (pace === null) {
    maxTurnsLeft = endTurnNum! - turnNum;
  } else {
    let cardsToBePlayed = maxScore - score;
    let discards = pace;
    if (pace < 0) {
      cardsToBePlayed += pace;
      discards = 0;
    }
    maxTurnsLeft = discards + cluesStillUsable! + cardsToBePlayed;
  }
  const maxTurnsLeftForCurrentPlayer = Math.ceil(maxTurnsLeft / numPlayers);
  const maxTotalTurns = turnNum + maxTurnsLeft;

  const label = globals.elements.turnNumberLabel;
  assertNotNull(label, "turnNumberLabel is not initialized.");

  label.tooltipContent = `<span class="turns-description">Rounds left (max):</span> <strong>${maxTurnsLeftForCurrentPlayer}</strong><br />
&nbsp; &nbsp; &nbsp; &nbsp;<span class="turns-description">Turns left (max):</span> <strong>${maxTurnsLeft}</strong><br />
&nbsp; &nbsp; &nbsp; &nbsp;<span class="turns-description">Total turns:</span> <strong>${turnNum}</strong>/<strong>${maxTotalTurns}</strong>`;
  konvaTooltips.init(label, true, false);
}
