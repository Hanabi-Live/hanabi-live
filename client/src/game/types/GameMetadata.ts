import Options from './Options';

export default interface GameMetadata {
  readonly options: Options;
  readonly playerNames: string[];
  // If in a game, equal to the player index that we correspond to
  // If spectating an ongoing game or a replay, equal to the player index that we are observing from
  readonly ourPlayerIndex: number;
  readonly spectating: boolean;
  readonly characterAssignments: Readonly<Array<number | null>>;
  readonly characterMetadata: number[];
}

export function getPlayerName(playerIndex: number, metadata: GameMetadata) {
  return metadata.playerNames[playerIndex] ?? 'Hanabi Live';
}
