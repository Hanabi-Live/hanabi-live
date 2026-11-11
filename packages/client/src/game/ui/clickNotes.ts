import { noop } from "complete-common";
import type { HanabiCard } from "./HanabiCard.ts";
import { globals } from "./UiGlobals.ts";
import * as notes from "./notes.ts";

export function clickRightCheckAddNote(
  event: MouseEvent,
  card: HanabiCard,
  isSpeedrun: boolean,
): void {
  // Note hotkeys should only work in ongoing games.
  if (globals.state.finished) {
    return;
  }

  // Ctrl + shift + alt + right-click is a "kt" note. (This is a common abbreviation for "this card
  // is known trash".)
  if (event.ctrlKey && event.shiftKey && event.altKey && !event.metaKey) {
    card.appendNote("kt");
    return;
  }

  // Ctrl + shift + right-click is a shortcut for entering the same note as previously entered.
  // (This must be above the other note code because of the modifiers.)
  if (event.ctrlKey && event.shiftKey && !event.altKey && !event.metaKey) {
    card.setNote(globals.lastNote);
    return;
  }

  // Ctrl + alt + right-click is prepend turn count.
  if (event.ctrlKey && !event.shiftKey && event.altKey && !event.metaKey) {
    card.prependTurnCountNote(`#${globals.elements.turnNumberLabel?.text()}`);
    return;
  }

  // Shift + right-click is a "f" note. (This is a common abbreviation for "this card is Finessed".)
  if (!event.ctrlKey && event.shiftKey && !event.altKey && !event.metaKey) {
    card.appendNote("f");
    return;
  }

  // Alt + right-click is a "cm" note. (This is a common abbreviation for "this card is chop
  // moved".)
  if (!event.ctrlKey && !event.shiftKey && event.altKey && !event.metaKey) {
    card.appendNote("cm");
    return;
  }

  // Shift + alt + right-click is a "ptd" note. (This is a common abbreviation for "this card has
  // permission to discard").
  if (!event.ctrlKey && event.shiftKey && event.altKey && !event.metaKey) {
    card.appendNote("ptd");
    return;
  }

  // A normal right-click is edit a note. (But in speedruns, this is ctrl + right-click.)
  if (
    event.ctrlKey === isSpeedrun
    && !event.shiftKey
    && !event.altKey
    && !event.metaKey
  ) {
    notes.openEditTooltip(card);
    return;
  }

  // Do nothing in the default case. (We need a function to satisfy the early return pattern.)
  noop();
}
