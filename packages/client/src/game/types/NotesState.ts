import type { AuthorNote, CardNote } from "@hanabi-live/game";

export interface NotesState {
  /** A sparse array indexed by card order. */
  readonly ourNotes: readonly CardNote[];

  /** A sparse array indexed by card order. */
  readonly allNotes: ReadonlyArray<readonly AuthorNote[]>;

  readonly efficiencyModifier: number;
}
