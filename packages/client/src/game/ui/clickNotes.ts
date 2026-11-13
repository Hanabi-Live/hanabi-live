import {
  appendToNote,
  getRightClickNoteAction,
  prependTurnToNote,
} from "../noteShortcuts.ts";
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

  const action = getRightClickNoteAction(event, isSpeedrun);
  const ourNote = globals.state.notes.ourNotes[card.order]?.text ?? "";
  switch (action?.type) {
    case "append": {
      const note = appendToNote(globals.variant, ourNote, action.text);
      if (note !== undefined) {
        card.setNote(note);
      }
      break;
    }

    case "repeatLast": {
      card.setNote(globals.lastNote);
      break;
    }

    case "prependTurn": {
      // The turn that shows, counted from 1, as the "Turn" label shows it.
      const turnNum = globals.state.visibleState?.turn.turnNum ?? 0;
      const note = prependTurnToNote(globals.variant, ourNote, turnNum + 1);
      if (note !== undefined) {
        card.setNote(note);
      }
      break;
    }

    case "edit": {
      notes.openEditTooltip(card);
      break;
    }

    case undefined: {
      break;
    }
  }
}
