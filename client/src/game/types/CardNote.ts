export default interface CardNote {
  // The possible card identities included in the note (empty if none)
  possibilities: Array<[number, number]>;
  readonly knownTrash: boolean;
  readonly needsFix: boolean;
  readonly chopMoved: boolean;
  readonly finessed: boolean;
  readonly blank: boolean;
  readonly unclued: boolean;
  readonly critical: boolean;
  readonly text: string;
}
