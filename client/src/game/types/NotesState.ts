import CardNote from "./CardNote";
import SpectatorNote from "./SpectatorNote";

export default interface NotesState {
  readonly ourNotes: readonly CardNote[];
  readonly allNotes: readonly SpectatorNote[][];
}
