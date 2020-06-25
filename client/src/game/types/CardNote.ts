export default interface CardNote {
  // The suit corresponding to the note written on the card, if any
  suitIndex: number | null;
  // The rank corresponding to the note written on the card, if any
  rank: number | null;
  readonly knownTrash: boolean;
  readonly needsFix: boolean;
  readonly chopMoved: boolean;
  readonly finessed: boolean;
  readonly blank: boolean;
  readonly unclued: boolean;
}
