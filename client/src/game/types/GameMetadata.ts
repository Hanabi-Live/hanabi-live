import Options from './Options';

export default interface GameMetadata{
  readonly options: Options;
  readonly characterAssignments: number[];
  readonly characterMetadata: number[];
}
