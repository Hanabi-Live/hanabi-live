import type { NumPlayers, PaceRisk } from "@hanabi-live/game";
import { getEfficiency } from "@hanabi-live/game";
import { assertDefined } from "complete-common";
import { globals } from "../../UiGlobals.ts";
import { EFFICIENCY_DECIMAL_PLACES, LABEL_COLOR } from "../../constants.ts";
import { setKonvaTooltipContent } from "../../konvaTooltips.ts";
import { getPaceRiskColor } from "../../paceRiskColor.ts";

/** Cyan, for an efficiency that has a custom modification. */
const MODIFIED_EFFICIENCY_COLOR = "#00ffff";

/** Updates the labels on the right-hand side of the screen. */
export function onEfficiencyChanged(data: {
  cardsGotten: number;
  cardsGottenByNotes: number | undefined;
  efficiencyModifier: number;
  potentialCluesLost: number;
  maxScore: number;
  cluesStillUsableNotRounded: number | undefined;
  finalRoundEffectivelyStarted: boolean;
}): void {
  const cluesStillUsable =
    data.cluesStillUsableNotRounded === undefined
      ? undefined
      : Math.floor(data.cluesStillUsableNotRounded);

  const effLabel = globals.elements.efficiencyNumberLabel!;
  const effPipeLabel = globals.elements.efficiencyPipeLabel!;
  const effMinLabel = globals.elements.efficiencyMinNeededLabel!;

  // - If we are not currently using the shared segments, the shared efficiency modifier will not be
  //   applicable.
  // - Do not use the efficiency modifier during in-game replays.
  const shouldModifyEff = globals.state.finished
    ? globals.state.replay.shared !== undefined
      && globals.state.replay.shared.useSharedSegments
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
    if (cardsGottenByNotes !== undefined) {
      cardsGotten += cardsGottenByNotes;
    }
  } else {
    cardsGottenByNotes = undefined;
  }

  const cardsNotGotten = Math.max(data.maxScore - cardsGotten, 0);

  const efficiency = getEfficiency(cardsGotten, data.potentialCluesLost);
  const shownEfficiency = data.finalRoundEffectivelyStarted
    ? undefined
    : efficiency;
  const futureEfficiency =
    cluesStillUsable === undefined
      ? undefined
      : getEfficiency(cardsNotGotten, cluesStillUsable);

  if (futureEfficiency === undefined) {
    // Handle the case in which there are 0 possible clues remaining or the game has ended.
    effLabel.text("-");
  } else {
    // Show the efficiency and round it to 2 decimal places.
    effLabel.text(futureEfficiency.toFixed(EFFICIENCY_DECIMAL_PLACES));
  }

  const text = effLabel.text();
  const { width } = effLabel.measureSize(text);
  effLabel.width(width);

  // Reposition the two labels to the right of the efficiency label so that they are aligned
  // properly. The type of Konva.Text.width is "any" for some reason.
  const effLabelSize = effLabel.measureSize(effLabel.text()).width;
  if (typeof effLabelSize !== "number") {
    throw new TypeError("The width of effLabel was not a number.");
  }
  const pipeX = effLabel.x() + effLabelSize;
  effPipeLabel.x(pipeX);

  // The type of Konva.Text.width is "any" for some reason.
  const effPipeLabelSize = effPipeLabel.measureSize(effPipeLabel.text()).width;
  if (typeof effPipeLabelSize !== "number") {
    throw new TypeError("The width of effPipeLabel was not a number.");
  }
  const minEffX = pipeX + effPipeLabelSize;
  effMinLabel.x(minEffX);

  // Change the color of the efficiency label if there is a custom modification.
  const effLabelColor = cardsGottenModified
    ? MODIFIED_EFFICIENCY_COLOR
    : LABEL_COLOR;
  effLabel.fill(effLabelColor);

  // Update the tooltip
  const tooltipContent = `
    ${formatLine("Current cards gotten", data.cardsGotten)}
    ${formatLine(
      "Current cards noted as gotten",
      cardsGottenByNotes !== undefined && shouldModifyEff
        ? cardsGottenByNotes
        : "-",
    )}
    ${formatLine(
      "Current cards gotten modifier",
      shouldModifyEff ? efficiencyModifier : "-",
    )}
    ${formatLine("Potential clues lost", data.potentialCluesLost)}
    ${formatLine(
      "Current efficiency",
      shownEfficiency === undefined
        ? "-"
        : shownEfficiency.toFixed(EFFICIENCY_DECIMAL_PLACES),
    )}
    <br />
    ${formatLine("Cards remaining to get", cardsNotGotten)}
    ${formatLine(
      "Remaining possible clues",
      data.cluesStillUsableNotRounded ?? "-",
    )}
    ${formatLine(
      "Future required efficiency",
      futureEfficiency === undefined
        ? "-"
        : futureEfficiency.toFixed(EFFICIENCY_DECIMAL_PLACES),
    )}
    ${formatLine(
      "Spare clues",
      cluesStillUsable === undefined ? "-" : cluesStillUsable - cardsNotGotten,
    )}
    <br />
    Click / Double tap this number to add a modifier.
  `;
  setKonvaTooltipContent(effLabel, tooltipContent, false);

  globals.layers.UI.batchDraw();
}

function formatLine(left: string, right: number | string) {
  return `<span class="efficiency-description">${left}:</span> <strong>${right}</strong><br />`;
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
  pace: number | undefined;
  cluesStillUsable: number | undefined;
  score: number;
  maxScore: number;
  turnNum: number;
  endTurnNum: number | undefined;
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
  if (pace === undefined) {
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
  assertDefined(label, "turnNumberLabel is not initialized.");

  setKonvaTooltipContent(
    label,
    `<span class="turns-description">Rounds left (max):</span> <strong>${maxTurnsLeftForCurrentPlayer}</strong><br />
<span class="turns-description">Turns left (max):</span> <strong>${maxTurnsLeft}</strong><br />
<span class="turns-description">Total turns:</span> <strong>${turnNum}</strong>/<strong>${maxTotalTurns}</strong>`,
    false,
  );
}
