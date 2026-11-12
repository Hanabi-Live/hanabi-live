import { changeStartingHandVisibility } from "./hypothetical.ts";
import { globals } from "./UiGlobals.ts";

/** With `includeNotes`, the cards also apply our notes, as they do with Ctrl + Space. */
export function setGlobalEmpathy(enabled: boolean, includeNotes = false): void {
  const notes = enabled && includeNotes;
  if (
    enabled === globals.globalEmpathyEnabled
    && notes === globals.globalEmpathyIncludesNotes
  ) {
    return;
  }

  const wasEnabled = globals.globalEmpathyEnabled;
  globals.globalEmpathyEnabled = enabled;
  globals.globalEmpathyIncludesNotes = notes;
  for (const hand of globals.elements.playerHands) {
    if (wasEnabled && enabled) {
      // Only the notes changed, so the cards must redraw.
      hand.setEmpathy(false);
    }
    hand.setEmpathy(enabled);
  }
  globals.elements.deck?.setEmpathy(enabled);

  // Turning off global empathy also turned it off for the hypothetical's starting hand.
  if (!enabled && globals.state.replay.hypothetical !== undefined) {
    changeStartingHandVisibility();
  }
}
