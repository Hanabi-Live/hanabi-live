import type { Tuple } from "complete-common";
import type { NumPlayers } from "../types/NumPlayers";
import type { PlayerIndex } from "../types/PlayerIndex";
import type { Options } from "./Options";

/** This is for data that does not change once a game starts. */
export interface GameMetadata {
  readonly ourUsername: string;
  readonly options: Options;
  readonly playerNames: Readonly<Tuple<string, NumPlayers>>;

  /**
   * If in a game, equal to the player index that we correspond to. If spectating an ongoing game or
   * a replay, equal to the player index that we are observing from.
   */
  readonly ourPlayerIndex: PlayerIndex;

  readonly characterAssignments: Readonly<Tuple<number | null, NumPlayers>>;
  readonly characterMetadata: Readonly<Tuple<number, NumPlayers>>;

  /** The minimum efficiency required in order to get a perfect score in the chosen variant. */
  readonly minEfficiency: number;

  /** Whether or not this is considered a "hard" variant by the H-Group. */
  readonly hardVariant: boolean;

  readonly hasCustomSeed: boolean;
  readonly seed: string;
}
