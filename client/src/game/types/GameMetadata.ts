import Options from './Options';

export default interface GameMetadata {
  readonly options: Options;
  // If in a game, equal to the player index that we correspond to
  // If spectating an ongoing game or a replay, equal to the player index that we are observing from
  readonly ourPlayerIndex: number;
  readonly spectating: boolean;
  readonly replay: boolean;
  readonly characterAssignments: Readonly<Array<number | null>>;
  readonly characterMetadata: number[];
}
