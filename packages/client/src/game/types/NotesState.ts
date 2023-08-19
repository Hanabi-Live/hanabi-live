import type { CardNote } from "./CardNote";
import type { SpectatorNote } from "./SpectatorNote";

export interface NotesState {
  /** A sparse array indexed by card order. */
  readonly ourNotes: readonly CardNote[];

  /** A sparse array indexed by card order. */
  readonly allNotes: readonly SpectatorNote[][];

  readonly efficiencyModifier: number;
}
