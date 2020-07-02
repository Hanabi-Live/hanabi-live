import Options from './Options';

export default interface GameMetadata {
  readonly options: Options;
  readonly playerSeat: number | null; // Use null for spectating / replay
  readonly characterAssignments: number[];
  readonly characterMetadata: number[];
}
