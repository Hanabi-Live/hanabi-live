// Shows a game in the redesigned game screen, for players who turned on the "New UI" setting.

// The classic Konva screen still runs, hidden, for every game. It keeps handling the timers, the
// sounds, the hotkeys, the replays, and the hypotheticals, which change the store that both screens
// draw from. A player can switch to the classic screen at any time.

import type { Root } from "react-dom/client";
import { FADE_TIME_MS } from "../../constants";
import { renderRoot } from "../../renderRoot";
import { getHTMLElement } from "../../utils";
import { globals } from "../ui/UIGlobals";
import { GameScreen } from "./GameScreen";
import * as newUIState from "./newUIState";

let root: Root | undefined;

export function mount(): void {
  unmount();
  newUIState.setActive(true);
  $("#game-new-ui").fadeIn(FADE_TIME_MS);
  root = renderRoot(
    getHTMLElement("#game-new-ui"),
    <GameScreen onSwitchToClassic={switchToClassic} />,
  );
}

export function unmount(): void {
  if (root === undefined) {
    return;
  }

  root.unmount();
  root = undefined;
  newUIState.setActive(false);
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
