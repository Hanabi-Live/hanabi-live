// The ways that the classic game screen can draw what a player knows about a card. Players try them
// with the `empathy()` function in the browser console, so that they can compare them. The choice
// is not saved.

import { getEnumValues } from "complete-common";
import { globals } from "./UiGlobals.ts";

export enum EmpathyStyle {
  /** Separate rows of suit pips and rank pips. */
  Pips,

  /** Possibility rows, only when the separate pips cannot show the possible cards. */
  RowsWhenNeeded,

  /** One possibility row for each suit, always. */
  RowPerSuit,
}

const EMPATHY_STYLE_NAMES = {
  [EmpathyStyle.Pips]: "Old Empathy",
  [EmpathyStyle.RowsWhenNeeded]: "New Empathy A",
  [EmpathyStyle.RowPerSuit]: "New Empathy B",
} as const satisfies Record<EmpathyStyle, string>;

const EMPATHY_STYLES = getEnumValues(EmpathyStyle);

let empathyStyle = EmpathyStyle.RowsWhenNeeded;

export function getEmpathyStyle(): EmpathyStyle {
  return empathyStyle;
}

/** Switches to the next empathy style, redraws the cards, and returns the new style's name. */
function cycleEmpathyStyle(): string {
  const index = EMPATHY_STYLES.indexOf(empathyStyle);
  empathyStyle = EMPATHY_STYLES[(index + 1) % EMPATHY_STYLES.length]!;

  for (const card of globals.deck) {
    card.updatePips();
  }
  globals.layers.card.batchDraw();

  return EMPATHY_STYLE_NAMES[empathyStyle];
}

// Players call it from the browser console.
(globalThis as unknown as { empathy: () => string }).empathy =
  cycleEmpathyStyle;
