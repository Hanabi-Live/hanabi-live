import { statsRules } from "../../../rules";
import { PaceRisk } from "../../../types/GameState";
import { LABEL_COLOR } from "../../constants";
import globals from "../../globals";
import * as tooltips from "../../tooltips";

// onEfficiencyChanged updates the labels on the right-hand side of the screen
export function onEfficiencyChanged(data: {
  cardsGotten: number;
  cardsGottenByNotes: number | null;
  efficiencyModifier: number;
  potentialCluesLost: number;
  maxScore: number;
  cluesStillUsable: number | null;
  finalRoundEffectivelyStarted: boolean;
}): void {
  // Ensure that the labels exist
  const effCurrentLabel = globals.elements.efficiencyCurrentNumberLabel;
  if (!effCurrentLabel) {
    throw new Error(
      'efficiencyCurrentNumberLabel is not initialized in the "onEfficiencyChanged()" function.',
    );
  }
  const effPipe1Label = globals.elements.efficiencyPipe1Label;
  if (!effPipe1Label) {
    throw new Error(
      'efficiencyPipe1Label is not initialized in the "onEfficiencyChanged()" function.',
    );
  }
  const effFutureLabel = globals.elements.efficiencyFutureRequiredNumberLabel;
  if (!effFutureLabel) {
    throw new Error(
      'efficiencyFutureRequiredNumberLabel is not initialized in the "onEfficiencyChanged()" function.',
    );
  }
  const effPipe2Label = globals.elements.efficiencyPipe2Label;
  if (!effPipe2Label) {
    throw new Error(
      'efficiencyPipe2Label is not initialized in the "onEfficiencyChanged()" function.',
    );
  }
  const effMinLabel = globals.elements.efficiencyMinNeededConstLabel;
  if (!effMinLabel) {
    throw new Error(
      'efficiencyMinNeededConstLabel is not initialized in the "onEfficiencyChanged()" function.',
    );
  }

  let shouldModifyEff;
  if (globals.state.finished) {
    // If we are not currently using the shared segments,
    // the shared efficiency modifier will not be applicable
    shouldModifyEff =
      globals.state.replay.shared !== null &&
      globals.state.replay.shared.useSharedSegments;
  } else {
    // Don't use the efficiency modifier during in-game replays
    shouldModifyEff = globals.state.visibleState === globals.state.ongoingGame;
  }

  let { cardsGotten, cardsGottenByNotes } = data;
  const { efficiencyModifier } = data;
  let cardsGottenModified = false;
  if (shouldModifyEff) {
    cardsGotten += efficiencyModifier;
    if (efficiencyModifier !== 0) {
      // The user has specified a manual efficiency modification
      // (e.g. to account for a card that is Finessed)
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
    data.cluesStillUsable === null
      ? NaN
      : statsRules.efficiency(cardsNotGotten, data.cluesStillUsable);
  const shouldShowFutureEfficiency = Number.isFinite(futureEfficiency);

  if (shouldShowEfficiency) {
    // Show the efficiency and round it to 2 decimal places
    effCurrentLabel.text(efficiency.toFixed(2));
  } else {
    // Handle the case in which the game didn't start yet.
    effCurrentLabel.text("-");
  }
  effCurrentLabel.width(
    effCurrentLabel.measureSize(effCurrentLabel.text()).width,
  );

  if (shouldShowFutureEfficiency) {
    // Show the efficiency and round it to 2 decimal places
    effFutureLabel.text(futureEfficiency.toFixed(2));
  } else {
    // Handle the case in which there are 0 possible clues remaining or the game has ended.
    effFutureLabel.text("-");
  }
  effFutureLabel.width(effFutureLabel.measureSize(effFutureLabel.text()).width);

  // Reposition the labels to the right of the efficiency label so that they are aligned
  // properly
  let x = effCurrentLabel.x();
  for (const label of [
    effCurrentLabel,
    effPipe1Label,
    effFutureLabel,
    effPipe2Label,
    effMinLabel,
  ]) {
    if (label === null) continue;
    label.x(x);
    // The type of Konva.Text.width is "any" for some reason
    const size = label.measureSize(label.text()).width as number;
    if (typeof size !== "number") {
      throw new Error("The width of eff label was not a number.");
    }
    x += size;
  }

  // Change the color of the efficiency label if there is a custom modification
  const effLabelColor = cardsGottenModified ? "#00ffff" : LABEL_COLOR;
  effCurrentLabel.fill(effLabelColor);
  effFutureLabel.fill(effLabelColor);

  // Update the tooltip
  function formatLine(left: string, right: number | string, usePadding = true) {
    return `${
      usePadding ? "&nbsp; &nbsp; &nbsp; &nbsp; " : ""
    }<span class="efficiency-description">${left}:</span> <strong>${right}</strong><br />`;
  }
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
      data.cluesStillUsable === null ? "-" : data.cluesStillUsable,
    )}
    ${formatLine(
      "Future required efficiency",
      shouldShowFutureEfficiency ? futureEfficiency.toFixed(2) : "-",
    )}
    ${formatLine(
      "Number finesses required",
      data.cluesStillUsable !== null && shouldShowFutureEfficiency
        ? Math.max(cardsNotGotten - data.cluesStillUsable, 0)
        : "-",
    )}
    <br />
    Alt + right click this number to add a modifier.
  `;
  effCurrentLabel.tooltipContent = tooltipContent;
  effFutureLabel.tooltipContent = tooltipContent;
  tooltips.init(effCurrentLabel, true, false);
  tooltips.init(effFutureLabel, true, false);

  globals.layers.UI.batchDraw();
}

export function onPaceOrPaceRiskChanged(data: {
  pace: number | null;
  paceRisk: PaceRisk;
  finalRoundEffectivelyStarted: boolean;
}): void {
  const label = globals.elements.paceNumberLabel;
  if (!label) {
    throw new Error("paceNumberLabel is not initialized.");
  }

  // Update the pace
  // (part of the efficiency statistics on the right-hand side of the screen)
  // If there are no cards left in the deck, pace is meaningless
  if (data.pace === null || data.finalRoundEffectivelyStarted) {
    label.text("-");
    label.fill(LABEL_COLOR);
  } else {
    let paceText = data.pace.toString();
    if (data.pace > 0) {
      paceText = `+${data.pace}`;
    }
    label.text(paceText);

    // Color the pace label depending on how "risky" it would be to discard
    // (approximately)
    switch (data.paceRisk) {
      case "Zero": {
        // No more discards can occur in order to get a maximum score
        label.fill("#df1c2d"); // Red
        break;
      }
      case "HighRisk": {
        // It would probably be risky to discard
        label.fill("#ef8c1d"); // Orange
        break;
      }
      case "MediumRisk": {
        // It might be risky to discard
        label.fill("#efef1d"); // Yellow
        break;
      }
      case "LowRisk":
      default: {
        // We are not even close to the "End-Game", so give it the default color
        label.fill(LABEL_COLOR);
        break;
      }
      case "Null": {
        console.error(
          `An invalid value of pace / risk was detected. Pace = ${data.pace}, Risk = Null`,
        );
        break;
      }
    }
  }

  globals.layers.UI.batchDraw();
}

export function onMaxTurnsChanged(data: {
  pace: number | null;
  cluesStillUsable: number | null;
  score: number;
  maxScore: number;
  turnNum: number;
  endTurnNum: number | null;
  numPlayers: number;
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
  if (!label) {
    throw new Error("turnNumberLabel is not initialized.");
  }
  label.tooltipContent = `<span class="turns-description">Rounds left (max):</span> <strong>${maxTurnsLeftForCurrentPlayer}</strong><br />
&nbsp; &nbsp; &nbsp; &nbsp;<span class="turns-description">Turns left (max):</span> <strong>${maxTurnsLeft}</strong><br />
&nbsp; &nbsp; &nbsp; &nbsp;<span class="turns-description">Total turns:</span> <strong>${turnNum}</strong>/<strong>${maxTotalTurns}</strong>`;
  tooltips.init(label, true, false);
}
