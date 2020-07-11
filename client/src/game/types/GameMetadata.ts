import Options from './Options';

export default interface GameMetadata {
  readonly options: Options;
  // Equal to the player index that we correspond to; is null when spectating or in a replay
  readonly playerSeat: number | null;
  readonly spectating: boolean;
  readonly characterAssignments: Readonly<Array<number | null>>;
  readonly characterMetadata: number[];
}
