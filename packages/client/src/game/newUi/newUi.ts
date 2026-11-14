// Shows a game in the redesigned game screen, for players who turned on the "New UI" setting.
// "App.tsx" renders the screen while the store says that it is shown.

// The classic Konva screen is not built for a game that the New UI shows. A player can switch to
// the classic screen at any time, which builds it then.

import { flushSync } from "react-dom";
import { fadeIn, hideElement, showElement } from "../../elementVisibility.ts";
import { store } from "../../store.ts";
import { getHtmlElement } from "../../utils.ts";
import { buildClassicScreen } from "../main.ts";
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
    buildClassicScreen();
  }, 0);
}
