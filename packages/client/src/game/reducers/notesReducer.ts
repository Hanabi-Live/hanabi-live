import type { Variant } from "@hanabi/data";
import {
  BLANK_NOTES,
  CHOP_MOVED_NOTES,
  CLUED_NOTES,
  EXCLAMATION_MARK_NOTES,
  FINESSED_NOTES,
  getVariant,
  KNOWN_TRASH_NOTES,
  NEEDS_FIX_NOTES,
  QUESTION_MARK_NOTES,
  UNCLUED_NOTES,
} from "@hanabi/data";
import equal from "fast-deep-equal";
import type { Draft } from "immer";
import { castDraft, produce } from "immer";
import type { NoteAction } from "../types/actions";
import type { CardNote } from "../types/CardNote";
import type { GameMetadata } from "../types/GameMetadata";
import type { NotesState } from "../types/NotesState";
import * as noteIdentity from "./noteIdentity";

export const notesReducer = produce(notesReducerFunction, {} as NotesState);

const emptyNotes: Map<string, CardNote> = new Map<string, CardNote>();

function notesReducerFunction(
  notes: Draft<NotesState>,
  action: NoteAction,
  metadata: GameMetadata,
  playing: boolean,
  finished: boolean,
) {
  const variant = getVariant(metadata.options.variantName);
  switch (action.type) {
    case "setEffMod": {
      notes.efficiencyModifier = action.mod;
      break;
    }

    case "editNote": {
      const newNote = parseNote(variant, action.text);
      notes.ourNotes[action.order] = castDraft(newNote);

      if (!playing) {
        const spectatorNotes = notes.allNotes[action.order];
        if (spectatorNotes !== undefined) {
          for (const spectatorNote of spectatorNotes) {
            if (spectatorNote.name === metadata.ourUsername) {
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
      // Add in the notes received from server.
      notes.allNotes[action.order] = action.notes;
      break;
    }

    case "noteList": {
      // Reset any existing notes.
      for (let i = 0; i < notes.allNotes.length; i++) {
        notes.allNotes[i] = [];
      }

      // Set the new notes.
      for (const [i, noteTextList] of action.noteTextLists.entries()) {
        // If we are a spectator, copy our notes from combined list.
        const name = action.names[i];
        if (name === undefined) {
          continue;
        }

        const isSpectator = action.isSpectators[i];
        if (isSpectator === undefined) {
          continue;
        }

        if (name === metadata.ourUsername && !playing && !finished) {
          for (const [order, text] of noteTextList.entries()) {
            const newNote = parseNote(variant, text);
            notes.ourNotes[order] = castDraft(newNote);
          }
        }

        for (const [order, text] of noteTextList.entries()) {
          const spectatorNotes = notes.allNotes[order];
          if (spectatorNotes !== undefined) {
            spectatorNotes.push({
              name,
              text,
              isSpectator,
            });
          }
        }
      }

      break;
    }
  }
}

function getNoteKeywords(note: string) {
  // Match either:
  // - zero or more characters between square brackets `[]`
  //   - \[(.*?)\]
  // - zero or more non-pipe non-bracket characters between a pipe `|` and the end of the note
  //   - \|([^[|]*$)
  // - one or more non-pipe non-bracket characters between the start and end of the note
  //   - (^[^[|]+$)
  const regexp = /\[(.*?)]|\|([^[|]*$)|(^[^[|]+$)/g;
  const keywords: string[] = [];

  let match = regexp.exec(note);
  while (match !== null) {
    if (match[1] !== undefined) {
      keywords.push(match[1].trim());
    } else if (match[2] !== undefined) {
      keywords.push(match[2].trim());
    } else if (match[3] !== undefined) {
      keywords.push(match[3].trim());
    }

    match = regexp.exec(note);
  }

  return keywords;
}

function checkNoteKeywordsForMatch(
  patterns: readonly string[],
  keywords: string[],
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
  const knownTrash = checkNoteKeywordsForMatch(KNOWN_TRASH_NOTES, keywords);
  const needsFix = checkNoteKeywordsForMatch(NEEDS_FIX_NOTES, keywords);
  const questionMark = checkNoteKeywordsForMatch(QUESTION_MARK_NOTES, keywords);
  const exclamationMark = checkNoteKeywordsForMatch(
    EXCLAMATION_MARK_NOTES,
    keywords,
  );
  const blank = checkNoteKeywordsForMatch(BLANK_NOTES, keywords);
  const unclued = checkNoteKeywordsForMatch(UNCLUED_NOTES, keywords);
  const clued = checkNoteKeywordsForMatch(CLUED_NOTES, keywords);

  return {
    possibilities,
    chopMoved,
    finessed,
    knownTrash,
    needsFix,
    questionMark,
    exclamationMark,
    blank,
    unclued,
    clued,
    text,
  };
}
