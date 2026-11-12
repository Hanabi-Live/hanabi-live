// The color of the pace number, by how risky it would be to discard (approximately). Both game
// screens use it.

import { PaceRisk } from "@hanabi-live/game";
import { WARNING_COLOR } from "./constants.ts";

/** Yellow, for a medium pace risk. */
const PACE_MEDIUM_RISK_COLOR = "#efef1d";

/** Orange, for a high pace risk. */
const PACE_HIGH_RISK_COLOR = "#ef8c1d";

/** Returns the color of the pace, or `undefined` for a low risk, which keeps the normal color. */
export function getPaceRiskColor(paceRisk: PaceRisk): string | undefined {
  switch (paceRisk) {
    case PaceRisk.Low: {
      return undefined;
    }

    case PaceRisk.Medium: {
      return PACE_MEDIUM_RISK_COLOR;
    }

    case PaceRisk.High: {
      return PACE_HIGH_RISK_COLOR;
    }

    case PaceRisk.Zero: {
      return WARNING_COLOR;
    }
  }
}
