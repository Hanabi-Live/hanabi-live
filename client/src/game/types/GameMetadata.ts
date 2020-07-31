import Options from '../../types/Options';

// GameMetadata is for data that does not change
export default interface GameMetadata {
  readonly options: Options;
  readonly playerNames: string[];
  // If in a game, equal to the player index that we correspond to
  // If spectating an ongoing game or a replay, equal to the player index that we are observing from
  readonly ourPlayerIndex: number;
  // Equal to true if we are playing in an ongoing game
  // Equal to false is we are spectating an ongoing game, in a dedicated solo replay,
  // or in a shared replay
  readonly playing: boolean;
  // Equal to true if we are in a dedicated solo replay or a shared replay
  readonly finished: boolean;
  readonly characterAssignments: Readonly<Array<number | null>>;
  readonly characterMetadata: number[];
}

export const getPlayerName = (
  playerIndex: number,
  metadata: GameMetadata,
) => metadata.playerNames[playerIndex] ?? 'Hanabi Live';
