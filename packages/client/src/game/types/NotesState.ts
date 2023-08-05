import type { CardNote } from "./CardNote";
import type { SpectatorNote } from "./SpectatorNote";

export interface NotesState {
  // These are indexed by order.
  readonly ourNotes: readonly CardNote[];
  readonly allNotes: readonly SpectatorNote[][];
  readonly efficiencyModifier: number;
}
