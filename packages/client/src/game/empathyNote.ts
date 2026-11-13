import type {
  AuthorNote,
  CardNote,
  CardOrder,
  Variant,
} from "@hanabi-live/game";
import { BLANK_NOTE } from "./newUi/tableView.ts";
import { parseNote } from "./reducers/notesReducer.ts";
import type { State } from "./types/State.ts";

const parsedNotes = new WeakMap<AuthorNote, CardNote>();

/**
 * Returns the note that Ctrl + Space empathy applies to a card. When we play or shadow a player,
 * this is our own note. Otherwise, such as in a replay, it is the note that the card's holder
 * wrote, so that each hand shows what its player thought of it.
 */
export function getEmpathyNote(
  state: State,
  variant: Variant,
  order: CardOrder,
): CardNote {
  if (state.playing || state.shadowing) {
    return state.notes.ourNotes[order] ?? BLANK_NOTE;
  }

  const location = state.visibleState?.deck.at(order)?.location;
  if (typeof location !== "number") {
    return BLANK_NOTE;
  }

  const holder = state.metadata.playerNames[location];
  const authorNote = state.notes.allNotes[order]?.find(
    (note) => !note.spectator && note.username === holder,
  );
  if (authorNote === undefined) {
    return BLANK_NOTE;
  }

  let note = parsedNotes.get(authorNote);
  if (note === undefined) {
    note = parseNote(variant, authorNote.text);
    parsedNotes.set(authorNote, note);
  }

  return note;
}
