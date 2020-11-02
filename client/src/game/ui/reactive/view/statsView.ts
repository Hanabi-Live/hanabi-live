import { PaceRisk } from "../../../types/GameState";
import { LABEL_COLOR } from "../../constants";
import globals from "../../globals";

// onFutureEfficiencyChanged updates the labels on the right-hand side of the screen
export function onFutureEfficiencyChanged(efficiency: number | null): void {
  const effLabel = globals.elements.efficiencyNumberLabel;
  if (!effLabel) {
    throw new Error(
      'efficiencyNumberLabel is not initialized in the "onEfficiencyChanged()" function.',
    );
  }
  const effPipeLabel = globals.elements.efficiencyPipeLabel;
  if (!effPipeLabel) {
    throw new Error(
      'efficiencyPipeLabel is not initialized in the "onEfficiencyChanged()" function.',
    );
  }
  const effMinLabel = globals.elements.efficiencyMinNeededLabel;
  if (!effMinLabel) {
    throw new Error(
      'efficiencyNumberLabelMinNeeded is not initialized in the "onEfficiencyChanged()" function.',
    );
  }

  if (efficiency !== null && Number.isFinite(efficiency)) {
    // Show the efficiency and round it to 2 decimal places
    effLabel.text(efficiency.toFixed(2));
    effLabel.width(effLabel.measureSize(effLabel.text()).width);
  } else {
    // Handle the case in which there are 0 possible clues remaining or the game has ended.
    effLabel.text("-");
  }

  // Reposition the two labels to the right of the efficiency label so that they are aligned
  // properly
  // The type of Konva.Text.width is "any" for some reason
  const effLabelSize = effLabel.measureSize(effLabel.text()).width as number;
  if (typeof effLabelSize !== "number") {
    throw new Error("The width of effLabel was not a number.");
  }
  const pipeX = effLabel.x() + effLabelSize;
  effPipeLabel.x(pipeX);

  // The type of Konva.Text.width is "any" for some reason
  const effPipeLabelSize = effPipeLabel.measureSize(effPipeLabel.text())
    .width as number;
  if (typeof effPipeLabelSize !== "number") {
    throw new Error("The width of effPipeLabel was not a number.");
  }
  const minEffX = pipeX + effPipeLabelSize;
  effMinLabel.x(minEffX);

  globals.layers.UI.batchDraw();
}

export function onPaceOrPaceRiskChanged(data: {
  pace: number | null;
  paceRisk: PaceRisk;
}): void {
  const label = globals.elements.paceNumberLabel;
  if (!label) {
    throw new Error("paceNumberLabel is not initialized.");
  }

  // Update the pace
  // (part of the efficiency statistics on the right-hand side of the screen)
  // If there are no cards left in the deck, pace is meaningless
  if (data.pace === null) {
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
