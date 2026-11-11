// Shows a game in the redesigned game screen, for players who turned on the "New UI" setting.

// The classic Konva screen still runs, hidden, for every game. It keeps handling the timers, the
// sounds, the hotkeys, the replays, and the hypotheticals, which change the store that both screens
// draw from. A player can switch to the classic screen at any time.

import type { Root } from "react-dom/client";
import { FADE_TIME_MS } from "../../constants.ts";
import { renderRoot } from "../../renderRoot.tsx";
import { getHtmlElement } from "../../utils.ts";
import { globals } from "../ui/UiGlobals.ts";
import { GameScreen } from "./GameScreen.tsx";
import * as newUiState from "./newUiState.ts";

let root: Root | undefined;

export function mount(): void {
  unmount();
  newUiState.setActive(true);
  $("#game-new-ui").fadeIn(FADE_TIME_MS);
  root = renderRoot(
    getHtmlElement("#game-new-ui"),
    <GameScreen onSwitchToClassic={switchToClassic} />,
  );
}

export function unmount(): void {
  if (root === undefined) {
    return;
  }

  root.unmount();
  root = undefined;
  newUiState.setActive(false);
  $("#game-new-ui").hide();
}

/** Shows the classic game screen in place of the new one, for the rest of this game. */
function switchToClassic() {
  // React cannot unmount a root while it is rendering it, so wait until it finishes.
  setTimeout(() => {
    if (root === undefined) {
      return;
    }

    unmount();
    $("#game").show();
    globals.stage.batchDraw();
  }, 0);
}
