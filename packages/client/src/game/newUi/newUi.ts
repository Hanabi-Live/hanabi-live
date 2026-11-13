// Shows a game in the redesigned game screen, for players who turned on the "New UI" setting.
// "App.tsx" renders the screen while the store says that it is shown.

// The classic Konva screen still runs, hidden, for every game. It keeps handling the timers, the
// sounds, the hotkeys, the replays, and the hypotheticals, which change the store that both screens
// draw from. A player can switch to the classic screen at any time.

import { flushSync } from "react-dom";
import { fadeIn, hideElement, showElement } from "../../elementVisibility.ts";
import { store } from "../../store.ts";
import { getHtmlElement } from "../../utils.ts";
import { globals } from "../ui/UiGlobals.ts";
import { newUiShownChanged } from "./newUiSlice.ts";

export function mount(): void {
  unmount();
  fadeIn(getHtmlElement("#game-new-ui"));
  // Render at once, so that the code that runs next finds the screen's elements.
  flushSync(() => {
    store.dispatch(newUiShownChanged(true));
  });
}

export function unmount(): void {
  if (!store.getState().newUi.shown) {
    return;
  }

  flushSync(() => {
    store.dispatch(newUiShownChanged(false));
  });
  hideElement(getHtmlElement("#game-new-ui"));
}

/** Shows the classic game screen in place of the new one, for the rest of this game. */
export function switchToClassic(): void {
  // React cannot render again while it is rendering, so wait until it finishes.
  setTimeout(() => {
    if (!store.getState().newUi.shown) {
      return;
    }

    unmount();
    showElement(getHtmlElement("#game"));
    globals.stage.batchDraw();
  }, 0);
}
