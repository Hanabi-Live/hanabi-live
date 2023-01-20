export interface CardNote {
  /** The possible card identities included in the note (or an empty array if there are none). */
  possibilities: Array<[number, number]>;

  readonly knownTrash: boolean;
  readonly needsFix: boolean;
  readonly questionMark: boolean;
  readonly exclamationMark: boolean;
  readonly chopMoved: boolean;
  readonly finessed: boolean;
  readonly blank: boolean;
  readonly unclued: boolean;
  readonly clued: boolean;
  readonly text: string;
}
