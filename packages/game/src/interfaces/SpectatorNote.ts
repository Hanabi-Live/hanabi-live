export interface SpectatorNote {
  /** The username of the person setting the note. */
  readonly name: string;

  readonly text: string;
  readonly isSpectator: boolean;
}
