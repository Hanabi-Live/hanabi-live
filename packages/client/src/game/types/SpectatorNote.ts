export default interface SpectatorNote {
  // This is the username of the person setting the note.
  readonly name: string;
  readonly text: string;
  readonly isSpectator: boolean;
}
