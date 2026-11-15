// The highlight arrow on the redesigned game screen (see "../highlightArrow.ts"). The arrow belongs
// to the view of the game that it was drawn on. As on the classic screen, it goes away when the
// screen shows another turn, or a hypothetical starts or ends.

import { store } from "../../store.ts";
import type { ArrowTarget } from "../highlightArrow.ts";
import { canDrawArrow, getToggledArrow, sendArrow } from "../highlightArrow.ts";
import type { ModifierKeys } from "../noteShortcuts.ts";
import type { State } from "../types/State.ts";
import type { ShownArrow } from "./newUiSlice.ts";
import { newUiArrowChanged } from "./newUiSlice.ts";

/** The view of the game that the screen shows: the turn, and whether it is in a hypothetical. */
export function getArrowView(state: State): string {
  const place =
    state.replay.hypothetical === undefined ? "game" : "hypothetical";
  return `${place}-${state.visibleState?.turn.segment}`;
}

/** What the arrow points at in the view that the screen shows, if anything. */
export function getShownArrowTarget(
  arrow: ShownArrow | undefined,
  state: State | undefined,
): ArrowTarget | undefined {
  return state !== undefined && arrow?.view === getArrowView(state)
    ? arrow.target
    : undefined;
}

/** Points the arrow at a target in the view that the screen shows, or hides it. */
export function showArrow(target: ArrowTarget | undefined): void {
  const state = store.getState().game.current;
  store.dispatch(
    newUiArrowChanged(
      target === undefined || state === undefined
        ? undefined
        : {
            target,
            view: getArrowView(state),
          },
    ),
  );
}

/**
 * Toggles the arrow on a target. A shared replay's leader also shows it to the followers, or hides
 * it from them.
 */
export function toggleArrow(target: ArrowTarget, alwaysShow = false): void {
  const root = store.getState();
  const state = root.game.current;
  if (state === undefined) {
    return;
  }

  const next = getToggledArrow(
    getShownArrowTarget(root.newUi.arrow, state),
    target,
    alwaysShow,
  );
  showArrow(next);
  sendArrow(state, next);
}

/**
 * Whether a right-click with these keys held down draws an arrow on this screen. In a speedrun,
 * Ctrl + right-click edits a card's note instead, as on the classic screen.
 */
export function canDrawArrowNow(keys: ModifierKeys): boolean {
  const state = store.getState().game.current;
  if (state === undefined || !canDrawArrow(state, keys)) {
    return false;
  }

  const speedrun =
    state.metadata.options.speedrun
    || store.getState().session.settings.speedrunFeatures;
  return state.finished || !speedrun;
}
