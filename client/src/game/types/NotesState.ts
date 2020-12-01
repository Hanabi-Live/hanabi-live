import CardNote from "./CardNote";
import SpectatorNote from "./SpectatorNote";

export default interface NotesState {
  // These are indexed by order
  readonly ourNotes: readonly CardNote[];
  readonly allNotes: readonly SpectatorNote[][];
  readonly efficiencyModifier: number;
}
