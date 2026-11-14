import { globals } from "../../UiGlobals.ts";

/** Once the first state is drawn, the moves that follow animate. */
export function onInitializationChanged(initialized: boolean): void {
  if (!initialized || globals.isResizing) {
    return;
  }

  globals.animateFast = false;
}
