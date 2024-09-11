import { noop } from "complete-common";
import type { HanabiCard } from "./HanabiCard";
import { globals } from "./UIGlobals";
import * as notes from "./notes";

let lastNote = "";

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
    lastNote = "kt";
    card.appendNote(lastNote);
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
    lastNote = `#${globals.elements.turnNumberLabel?.text()}`;
    card.prependTurnCountNote(lastNote);
    return;
  }

  // Shift + right-click is a "f" note. (This is a common abbreviation for "this card is Finessed".)
  if (!event.ctrlKey && event.shiftKey && !event.altKey && !event.metaKey) {
    lastNote = "f";
    card.appendNote(lastNote);
    return;
  }

  // Alt + right-click is a "cm" note. (This is a common abbreviation for "this card is chop
  // moved".)
  if (!event.ctrlKey && !event.shiftKey && event.altKey && !event.metaKey) {
    lastNote = "cm";
    card.appendNote(lastNote);
    return;
  }

  // A normal right-click is edit a note. (But in speedruns, this is ctrl + right-click.)
  if (
    event.ctrlKey === isSpeedrun &&
    !event.shiftKey &&
    !event.altKey &&
    !event.metaKey
  ) {
    preOpenNoteEditTooltip(card);
    return;
  }

  // Do nothing in the default case. (We need a function to satisfy the early return pattern.)
  noop();
}

export function preOpenNoteEditTooltip(card: HanabiCard): void {
  lastNote = "";
  notes.openEditTooltip(card);
}
