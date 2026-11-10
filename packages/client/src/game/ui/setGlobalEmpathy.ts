import { changeStartingHandVisibility } from "./hypothetical";
import { globals } from "./UIGlobals";

export function setGlobalEmpathy(enabled: boolean): void {
  if (enabled === globals.globalEmpathyEnabled) {
    return;
  }

  globals.globalEmpathyEnabled = enabled;
  for (const hand of globals.elements.playerHands) {
    hand.setEmpathy(enabled);
  }
  globals.elements.deck?.setEmpathy(enabled);

  // Turning off global empathy also turned it off for the hypothetical's starting hand.
  if (!enabled && globals.state.replay.hypothetical !== undefined) {
    changeStartingHandVisibility();
  }
}
