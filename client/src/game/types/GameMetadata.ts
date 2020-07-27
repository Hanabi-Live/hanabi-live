import Options from '../../types/Options';

export default interface GameMetadata {
  readonly options: Options;
  readonly playerNames: string[];
  // If in a game, equal to the player index that we correspond to
  // If spectating an ongoing game or a replay, equal to the player index that we are observing from
  readonly ourPlayerIndex: number;
  // Equal to true if we are spectating an ongoing game
  // or if we are in a dedicated replay / shared replay
  readonly spectating: boolean;
  // Equal to true if we are in a dedicated replay / shared replay
  readonly finished: boolean;
  readonly characterAssignments: Readonly<Array<number | null>>;
  readonly characterMetadata: number[];
}

export const getPlayerName = (
  playerIndex: number,
  metadata: GameMetadata,
) => metadata.playerNames[playerIndex] ?? 'Hanabi Live';
