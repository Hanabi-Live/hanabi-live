import type { Tuple } from "complete-common";
import type { CardStatus } from "../enums/CardStatus.ts";
import type { StackDirection } from "../enums/StackDirection.ts";
import type { CardOrder } from "../types/CardOrder.ts";
import type { NumPlayers } from "../types/NumPlayers.ts";
import type { NumSuits } from "../types/NumSuits.ts";
import type { Rank } from "../types/Rank.ts";
import type { StateClue } from "../types/StateClue.ts";
import type { SuitRankMap } from "../types/SuitRankMap.ts";
import type { CardState } from "./CardState.ts";
import type { LogEntry } from "./LogEntry.ts";
import type { StateStrike } from "./StateStrike.ts";
import type { StatsState } from "./StatsState.ts";
import type { TurnState } from "./TurnState.ts";

export interface GameState {
  readonly turn: TurnState;
  readonly log: readonly LogEntry[];
  readonly deck: readonly CardState[];
  readonly cardsRemainingInTheDeck: number;

  /**
   * Card statues are indexed by suit index and rank.
   *
   * This only depends on a card's identity, not the card itself, so it is stored here rather than
   * as a sub-property of `CardState`.
   */
  readonly cardStatus: SuitRankMap<CardStatus>;

  readonly score: number;

  readonly clueTokens: number;
  readonly strikes: readonly StateStrike[];

  /** Indexed by player index. Each player has an array of card orders. */
  readonly hands: Readonly<Tuple<readonly CardOrder[], NumPlayers>>;

  /** Indexed by suit index. Each suit has an array of card orders. */
  readonly playStacks: Readonly<Tuple<readonly CardOrder[], NumSuits>>;

  readonly playStackDirections: Readonly<Tuple<StackDirection, NumSuits>>;

  /**
   * For Sudoku variants, this denotes the first rank played of this stack. If the stack is not
   * started yet, then the value stored is undefined.
   */
  readonly playStackStarts: Readonly<Tuple<Rank | undefined, NumSuits>>;

  /** For "Throw It in a Hole" variants. All played cards go into the hole. */
  readonly hole: readonly CardOrder[];

  /** Indexed by suit index. Each suit has an array of card orders. */
  readonly discardStacks: Readonly<Tuple<readonly CardOrder[], NumSuits>>;

  readonly clues: readonly StateClue[];
  readonly stats: StatsState;
}
