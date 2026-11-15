// The ways that the game screens can draw what a player knows about a card. Players try them with
// the `empathy()` function in the browser console, so that they can compare them. The choice is not
// saved.

import { getEnumValues } from "complete-common";

export enum EmpathyStyle {
  /** Separate rows of suit pips and rank pips. */
  Pips = "Pips",

  /** Possibility rows, only when the separate pips cannot show the possible cards. */
  RowsWhenNeeded = "RowsWhenNeeded",

  /** One possibility row for each suit, always. */
  RowPerSuit = "RowPerSuit",
}

const DEFAULT_EMPATHY_STYLE = EmpathyStyle.RowsWhenNeeded;

const EMPATHY_STYLE_NAMES = {
  [EmpathyStyle.Pips]: "Old Empathy",
  [EmpathyStyle.RowsWhenNeeded]: "New Empathy A",
  [EmpathyStyle.RowPerSuit]: "New Empathy B",
} as const satisfies Record<EmpathyStyle, string>;

const EMPATHY_STYLES = getEnumValues(EmpathyStyle);

let empathyStyle: EmpathyStyle = DEFAULT_EMPATHY_STYLE;

/** The functions that draw the cards again when the style changes. */
const listeners = new Set<() => void>();

export function getEmpathyStyle(): EmpathyStyle {
  return empathyStyle;
}

/**
 * Calls the function each time the style changes, until the returned function is called. Its shape
 * suits React's `useSyncExternalStore`.
 */
export function subscribeToEmpathyStyle(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

/** Switches to the next empathy style, redraws the cards, and returns the new style's name. */
function cycleEmpathyStyle(): string {
  const index = EMPATHY_STYLES.indexOf(empathyStyle);
  empathyStyle = EMPATHY_STYLES[(index + 1) % EMPATHY_STYLES.length]!;

  for (const listener of listeners) {
    listener();
  }

  return EMPATHY_STYLE_NAMES[empathyStyle];
}

// Players call it from the browser console.
// eslint-disable-next-line unicorn/no-top-level-side-effects, unicorn/no-global-object-property-assignment
(globalThis as unknown as { empathy: () => string }).empathy =
  cycleEmpathyStyle;
