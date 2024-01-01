import { noop } from "isaacscript-common-ts";
import type { HanabiCard } from "./HanabiCard";
import { globals } from "./UIGlobals";
import * as notes from "./notes";

let lastNote = "";

export function clickRightCheckAddNote(
  event: MouseEvent,
  card: HanabiCard,
  isSpeedrun: boolean,
): void {
  // Ctrl + shift + right-click is a shortcut for entering the same note as previously entered.
  // (This must be above the other note code because of the modifiers.)
  if (
    event.ctrlKey &&
    event.shiftKey &&
    !event.metaKey &&
    !globals.state.finished
  ) {
    if (event.altKey) {
      // When Alt is held, copy only the new part of the last note.
      if (lastNote === "") {
        const noteText = globals.lastNote;
        const lastPipe = noteText.lastIndexOf("|");
        const lastNoteString = noteText.slice(lastPipe + 1).trim();
        lastNote = lastNoteString;
      }
      card.appendNoteOnly(lastNote);
    } else {
      card.setNote(globals.lastNote);
    }
    return;
  }

  // Ctrl + alt + right-click is prepend turn count.
  if (
    event.ctrlKey &&
    !event.shiftKey &&
    event.altKey &&
    !event.metaKey &&
    !globals.state.finished
  ) {
    lastNote = `#${globals.elements.turnNumberLabel?.text()}`;
    card.prependTurnCountNote(lastNote);
    return;
  }

  // Shift + right-click is a "f" note. (This is a common abbreviation for "this card is Finessed".)
  if (
    !event.ctrlKey &&
    event.shiftKey &&
    !event.altKey &&
    !event.metaKey &&
    !globals.state.finished
  ) {
    lastNote = "f";
    card.appendNote(lastNote);
    return;
  }

  // Alt + right-click is a "cm" note. (This is a common abbreviation for "this card is chop
  // moved".)
  if (
    !event.ctrlKey &&
    !event.shiftKey &&
    event.altKey &&
    !event.metaKey &&
    !globals.state.finished
  ) {
    lastNote = "cm";
    card.appendNote(lastNote);
    return;
  }

  // A normal right-click is edit a note. (But in speedruns, this is ctrl + right-click.)
  if (
    event.ctrlKey === isSpeedrun &&
    !event.shiftKey &&
    !event.altKey &&
    !event.metaKey &&
    !globals.state.finished
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
