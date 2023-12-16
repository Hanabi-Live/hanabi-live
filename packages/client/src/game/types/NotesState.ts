import type { CardNote, SpectatorNote } from "@hanabi/game";

export interface NotesState {
  /** A sparse array indexed by card order. */
  readonly ourNotes: readonly CardNote[];

  /** A sparse array indexed by card order. */
  readonly allNotes: ReadonlyArray<readonly SpectatorNote[]>;

  readonly efficiencyModifier: number;
}
