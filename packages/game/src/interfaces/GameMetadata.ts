import type { Tuple } from "complete-common";
import type { NumPlayers } from "../types/NumPlayers.ts";
import type { PlayerIndex } from "../types/PlayerIndex.ts";
import type { Options } from "./Options.ts";

/** This is for data that does not change once a game starts. */
export interface GameMetadata {
  readonly ourUsername: string;
  readonly options: Options;
  readonly playerNames: Readonly<Tuple<string, NumPlayers>>;

  /**
   * Our seat: the one that we play in, the one that we shadow, or, in a replay, the one that we
   * played in. Absent when we have none, such as when we spectate without shadowing. Then we see
   * every card.
   */
  readonly ourPlayerIndex: PlayerIndex | undefined;

  readonly characterAssignments: Readonly<
    Tuple<number | undefined, NumPlayers>
  >;
  /** Absent for a player whose character uses no metadata. */
  readonly characterMetadata: Readonly<Tuple<number | undefined, NumPlayers>>;

  /** The minimum efficiency required in order to get a perfect score in the chosen variant. */
  readonly minEfficiency: number;

  /** Whether or not this is considered a "hard" variant by the H-Group. */
  readonly hardVariant: boolean;

  readonly hasCustomSeed: boolean;
  /** Absent for a game with its own deck instead of a seed, such as an imported one. */
  readonly seed: string | undefined;
}
