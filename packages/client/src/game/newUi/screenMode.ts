// While the screen shows something other than the game as it stands, it is in a mode. Each mode has
// its own color, which no other part of the screen uses. So the color tells the player what they
// look at. The game screen sets "--game-screen-mode" and "--game-screen-mode-panel" to the colors
// of its mode, and the mode's elements use them as "tw:text-game-mode", "tw:bg-game-mode-panel",
// and so on. When the mode changes, all of them change color together.

import type { State } from "../types/State.ts";
import { PANEL_SHADOW_CLASS } from "./surfaces.ts";

type ScreenMode = "inGameReplay" | "finishedReplay" | "hypothetical";

/** The prefix of the mode's colors in "public/css/tokens.css". */
const MODE_TOKEN = {
  inGameReplay: "--game-screen-in-game-replay",
  finishedReplay: "--game-screen-finished-replay",
  hypothetical: "--game-screen-hypothetical",
} as const satisfies Record<ScreenMode, string>;

/**
 * A panel of the mode, such as the replay bar: in the mode's dark color, outlined in its accent.
 */
export const MODE_PANEL_CLASS = `tw:bg-game-mode-panel tw:inset-ring-2 tw:inset-ring-game-mode ${PANEL_SHADOW_CLASS}`;

function getScreenMode(state: State): ScreenMode | undefined {
  if (state.replay.hypothetical !== undefined) {
    return "hypothetical";
  }
  if (state.finished) {
    return "finishedReplay";
  }
  return state.replay.segment === undefined ? undefined : "inGameReplay";
}

/** The style that gives the screen the colors of its mode. */
export function getScreenModeStyle(
  state: State,
):
  | Record<"--game-screen-mode" | "--game-screen-mode-panel", string>
  | undefined {
  const mode = getScreenMode(state);
  if (mode === undefined) {
    return undefined;
  }
  const token = MODE_TOKEN[mode];
  return {
    "--game-screen-mode": `var(${token})`,
    "--game-screen-mode-panel": `var(${token}-panel)`,
  };
}
