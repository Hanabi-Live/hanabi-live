import Options from "../../types/Options";

/** This is for data that does not change. */
export default interface GameMetadata {
  readonly ourUsername: string;
  readonly options: Options;
  readonly playerNames: string[];

  /**
   * If in a game, equal to the player index that we correspond to. If spectating an ongoing game or
   * a replay, equal to the player index that we are observing from.
   */
  readonly ourPlayerIndex: number;

  readonly characterAssignments: Readonly<Array<number | null>>;
  readonly characterMetadata: number[];

  readonly minEfficiency: number;
  readonly hardVariant: boolean;

  readonly hasCustomSeed: boolean;
  readonly seed: string;
}

export const getPlayerName = (
  playerIndex: number,
  metadata: GameMetadata,
): string => metadata.playerNames[playerIndex] ?? "Hanabi Live";

export const getPlayerNames = (
  playerIndices: number[] | null,
  metadata: GameMetadata,
): string => {
  if (playerIndices === null) {
    return "The players";
  }
  const playerNames = playerIndices.map((i) => getPlayerName(i, metadata));
  playerNames.sort();
  const { length } = playerNames;
  return `${playerNames
    .slice(0, length - 1)
    .join(", ")} and ${playerNames.slice(-1)}`;
};
