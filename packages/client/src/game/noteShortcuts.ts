// A right-click on a card edits its note. With keys held down, it writes a common note at once, on
// both game screens.

import type { Variant } from "@hanabi-live/game";
import {
  noteEqual,
  noteHasMeaning,
  parseNote,
} from "./reducers/notesReducer.ts";

/** What a right-click on a card does to its note. */
export type RightClickNoteAction =
  /** Adds a word to the last part of the note, such as "f" for "finessed". */
  | { readonly type: "append"; readonly text: string }
  /** Writes the note that the player saved last. */
  | { readonly type: "repeatLast" }
  /** Puts the turn number in front of the last part of the note. */
  | { readonly type: "prependTurn" }
  /** Opens the note to type in it. */
  | { readonly type: "edit" };

interface ModifierKeys {
  readonly ctrlKey: boolean;
  readonly shiftKey: boolean;
  readonly altKey: boolean;
  readonly metaKey: boolean;
}

/**
 * Returns what a right-click does with the keys that are held down. In speedruns, a plain
 * right-click does something else, so Ctrl + right-click edits the note instead.
 */
export function getRightClickNoteAction(
  { ctrlKey, shiftKey, altKey, metaKey }: ModifierKeys,
  isSpeedrun: boolean,
): RightClickNoteAction | undefined {
  if (metaKey) {
    return undefined;
  }

  // "kt" is short for "known trash".
  if (ctrlKey && shiftKey && altKey) {
    return {
      type: "append",
      text: "kt",
    };
  }
  if (ctrlKey && shiftKey) {
    return { type: "repeatLast" };
  }
  if (ctrlKey && altKey) {
    return { type: "prependTurn" };
  }
  // "ptd" is short for "permission to discard".
  if (shiftKey && altKey) {
    return {
      type: "append",
      text: "ptd",
    };
  }
  // "f" is short for "finessed".
  if (shiftKey) {
    return {
      type: "append",
      text: "f",
    };
  }
  // "cm" is short for "chop moved".
  if (altKey) {
    return {
      type: "append",
      text: "cm",
    };
  }
  if (ctrlKey === isSpeedrun) {
    return { type: "edit" };
  }

  return undefined;
}

/**
 * Puts a note in brackets when they keep its meaning, such as "k3" to "[k3]", so that later text
 * does not change it.
 */
function protectNote(variant: Variant, text: string): string {
  const bracketed = `[${text}]`;
  const note = parseNote(variant, text);
  return noteHasMeaning(variant, note)
    && noteEqual(note, parseNote(variant, bracketed))
    ? bracketed
    : text;
}

/**
 * Removes all text that is not in square brackets, such as "[cm] some text [r4] more text" to "[cm]
 * [r4]".
 */
function stripProse(text: string): string {
  // Consume an unterminated suffix instead of retrying at each opening bracket.
  const brackets = text.match(/\[[^\]]*\]?/gu) ?? [];
  return brackets.filter((bracket) => bracket.endsWith("]")).join(" ");
}

/** Whether a note changes the border of a card: chop moved, finessed, or permission to discard. */
function affectsBorder(variant: Variant, text: string): boolean {
  const note = parseNote(variant, text);
  return note.chopMoved || note.finessed || note.discardPermission;
}

/**
 * Returns the note after a word is added to its last part, or `undefined` when the word does not
 * change what the note means. A pipe character separates the parts of a note. `combine` joins the
 * last part and the word. With `keepLast`, the last part stays and the result becomes a new part
 * after it. With `strip`, the result keeps only the text in brackets, and only one word that
 * changes the card's border.
 */
function updateNote(
  variant: Variant,
  existingNote: string,
  added: string,
  combine: (last: string, added: string) => string,
  keepLast: boolean,
  strip: boolean,
): string | undefined {
  const noteText = existingNote.trim();
  const note = protectNote(variant, added);
  const lastPipe = noteText.lastIndexOf("|");
  const last = protectNote(variant, noteText.slice(lastPipe + 1).trim());
  let newLast = combine(last, note);

  if (strip) {
    newLast = stripProse(newLast);
    if (affectsBorder(variant, note)) {
      newLast = newLast
        .split(/(?<=\])\s+(?=\[)/u)
        .filter((token) => token === note || !affectsBorder(variant, token))
        .join(" ");
    }
  }

  if (
    noteHasMeaning(variant, parseNote(variant, note))
    && noteEqual(parseNote(variant, last), parseNote(variant, newLast))
  ) {
    return undefined;
  }

  const kept = keepLast
    ? noteText
    : noteText.slice(0, Math.max(lastPipe, 0)).trim();
  return `${kept}${kept === "" ? "" : " | "}${newLast}`;
}

/**
 * Returns the note after a shortcut word, such as "f", is added to it, or `undefined` when the word
 * does not change what the note means.
 */
export function appendToNote(
  variant: Variant,
  existingNote: string,
  added: string,
): string | undefined {
  return updateNote(
    variant,
    existingNote,
    added,
    (last, word) => `${last} ${word}`,
    true,
    true,
  );
}

/**
 * Returns the note with the turn number (counted from 1) in front of its last part, in place of any
 * turn number that was there.
 */
export function prependTurnToNote(
  variant: Variant,
  existingNote: string,
  turn: number,
): string | undefined {
  return updateNote(
    variant,
    existingNote,
    `#${turn}`,
    (last, word) => `${word} ${last.replace(/^#\d+ /u, "")}`,
    false,
    false,
  );
}
