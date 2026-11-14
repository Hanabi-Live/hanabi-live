import type {
  CardNote,
  GameMetadata,
  NoteAction,
  Variant,
} from "@hanabi-live/game";
import {
  BLANK_NOTES,
  CHOP_MOVED_NOTES,
  CLUED_NOTES,
  DISCARD_PERMISSION_NOTES,
  EXCLAMATION_MARK_NOTES,
  FINESSED_NOTES,
  getVariantById,
  KNOWN_TRASH_NOTES,
  NEEDS_FIX_NOTES,
  QUESTION_MARK_NOTES,
  SPOOK_NOTES,
  UNCLUED_NOTES,
} from "@hanabi-live/game";
import { assertDefined } from "complete-common";
import equal from "fast-deep-equal";
import type { Draft } from "immer";
import { castDraft, produce } from "immer";
import type { NotesState } from "../types/NotesState.ts";
import * as noteIdentity from "./noteIdentity.ts";

export const notesReducer = produce(notesReducerFunction, {} as NotesState);

const emptyNotes: Map<string, CardNote> = new Map<string, CardNote>();

function notesReducerFunction(
  notes: Draft<NotesState>,
  action: NoteAction,
  metadata: GameMetadata,
  playing: boolean,
  finished: boolean,
) {
  const variant = getVariantById(metadata.options.variantId);
  switch (action.type) {
    case "setEfficiencyModifier": {
      notes.efficiencyModifier = action.efficiencyModifier;
      break;
    }

    case "editNote": {
      const newNote = parseNote(variant, action.text);
      notes.ourNotes[action.order] = castDraft(newNote);

      if (!playing) {
        const spectatorNotes = notes.allNotes[action.order];
        if (spectatorNotes !== undefined) {
          for (const spectatorNote of spectatorNotes) {
            if (spectatorNote.username === metadata.ourUsername) {
              spectatorNote.text = action.text;
            }
          }
        }
      }

      break;
    }

    case "noteListPlayer": {
      for (const [i, text] of action.texts.entries()) {
        const newNote = parseNote(variant, text);
        notes.ourNotes[i] = castDraft(newNote);
      }
      break;
    }

    case "receiveNote": {
      // Replace the author's note on the card, or add it if they had none.
      const cardNotes = notes.allNotes[action.order];
      const existing = cardNotes?.find(
        (note) => note.username === action.note.username,
      );
      if (existing !== undefined) {
        existing.text = action.note.text;
      } else if (cardNotes === undefined) {
        notes.allNotes[action.order] = [castDraft(action.note)];
      } else {
        cardNotes.push(castDraft(action.note));
      }
      break;
    }

    case "noteList": {
      // Reset any existing notes.
      for (const i of notes.allNotes.keys()) {
        notes.allNotes[i] = [];
      }

      // Set the new notes.
      for (const { notes: noteTextList, spectator, username } of action.notes) {
        // If we are a spectator, copy our notes from combined list.
        if (username === metadata.ourUsername && !playing && !finished) {
          for (const [order, text] of noteTextList.entries()) {
            const newNote = parseNote(variant, text);
            notes.ourNotes[order] = castDraft(newNote);
          }
        }

        for (const [order, text] of noteTextList.entries()) {
          const spectatorNotes = notes.allNotes[order];
          if (spectatorNotes !== undefined) {
            spectatorNotes.push({
              username,
              text,
              spectator,
            });
          }
        }
      }

      break;
    }
  }
}

function getNoteKeywords(note: string): readonly string[] {
  if (note !== "" && !note.includes("[") && !note.includes("|")) {
    return [note.trim()];
  }

  // Consume unterminated brackets too, so repeated opening brackets do not cause backtracking.
  const regexp = /\[(?<keyword>[^\n\r\]\u{2028}\u{2029}]*)(?<closing>\])?/gu;
  const keywords: string[] = [];
  let lastBracketEnd = 0;

  for (const match of note.matchAll(regexp)) {
    const keyword = match.groups?.["keyword"];
    if (match.groups?.["closing"] === "]") {
      assertDefined(keyword, "Failed to get the bracketed note keyword.");
      keywords.push(keyword.trim());
      lastBracketEnd = match.index + match[0].length;
    }
  }

  const lastPipe = note.lastIndexOf("|");
  const trailingKeyword = note.slice(lastPipe + 1);
  if (lastPipe >= lastBracketEnd && !trailingKeyword.includes("[")) {
    keywords.push(trailingKeyword.trim());
  }

  return keywords;
}

function checkNoteKeywordsForMatch(
  patterns: readonly string[],
  keywords: readonly string[],
) {
  return keywords.some((k) => patterns.includes(k));
}

function getEmptyNote(variant: Variant): CardNote {
  const note: CardNote = emptyNotes.get(variant.name) ?? parseNote(variant, "");
  emptyNotes.set(variant.name, note);
  return note;
}

function noteWithoutText(note: CardNote): CardNote {
  return {
    ...note,
    text: "",
  };
}

export function noteEqual(note1: CardNote, note2: CardNote): boolean {
  return equal(noteWithoutText(note1), noteWithoutText(note2));
}

export function noteHasMeaning(variant: Variant, note: CardNote): boolean {
  return !noteEqual(noteWithoutText(note), getEmptyNote(variant));
}

export function parseNote(variant: Variant, text: string): CardNote {
  const lastPipeIndex = text.lastIndexOf("|");

  // No special handling is needed for the -1 case.
  const textAfterLastPipe = text.slice(lastPipeIndex + 1);

  // We make all letters lowercase to simply the matching logic below.
  const fullNote = textAfterLastPipe.toLowerCase().trim();

  const keywords = getNoteKeywords(fullNote);
  const possibilities = noteIdentity.getPossibilitiesFromKeywords(
    variant,
    keywords,
  );
  const chopMoved = checkNoteKeywordsForMatch(CHOP_MOVED_NOTES, keywords);
  const finessed = checkNoteKeywordsForMatch(FINESSED_NOTES, keywords);
  const discardPermission = checkNoteKeywordsForMatch(
    DISCARD_PERMISSION_NOTES,
    keywords,
  );
  const knownTrash = checkNoteKeywordsForMatch(KNOWN_TRASH_NOTES, keywords);
  const needsFix = checkNoteKeywordsForMatch(NEEDS_FIX_NOTES, keywords);
  const questionMark = checkNoteKeywordsForMatch(QUESTION_MARK_NOTES, keywords);
  const exclamationMark = checkNoteKeywordsForMatch(
    EXCLAMATION_MARK_NOTES,
    keywords,
  );
  const spook = checkNoteKeywordsForMatch(SPOOK_NOTES, keywords);
  const blank = checkNoteKeywordsForMatch(BLANK_NOTES, keywords);
  const unclued = checkNoteKeywordsForMatch(UNCLUED_NOTES, keywords);
  const clued = checkNoteKeywordsForMatch(CLUED_NOTES, keywords);

  return {
    possibilities,
    chopMoved,
    finessed,
    discardPermission,
    knownTrash,
    needsFix,
    questionMark,
    exclamationMark,
    spook,
    blank,
    unclued,
    clued,
    text,
  };
}
