import Options from '../../types/Options';

// GameMetadata is for data that does not change
export default interface GameMetadata {
  readonly ourUsername: string;
  readonly options: Options;
  readonly playerNames: string[];
  // If in a game, equal to the player index that we correspond to
  // If spectating an ongoing game or a replay, equal to the player index that we are observing from
  readonly ourPlayerIndex: number;
  readonly characterAssignments: Readonly<Array<number | null>>;
  readonly characterMetadata: number[];
}

export const getPlayerName = (
  playerIndex: number,
  metadata: GameMetadata,
) => metadata.playerNames[playerIndex] ?? 'Hanabi Live';
