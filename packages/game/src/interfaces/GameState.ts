import type {
  CardOrder,
  NumPlayers,
  NumSuits,
  Rank,
  SuitRankMap,
} from "@hanabi/data";
import type { DeepReadonly, Tuple } from "@hanabi/utils";
import type { CardStatus } from "../enums/CardStatus";
import type { StackDirection } from "../enums/StackDirection";
import type { StateClue } from "../types/StateClue";
import type { CardState } from "./CardState";
import type { LogEntry } from "./LogEntry";
import type { StateStrike } from "./StateStrike";
import type { StatsState } from "./StatsState";
import type { TurnState } from "./TurnState";

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
  readonly cardStatus: DeepReadonly<SuitRankMap<CardStatus>>;

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
   * started yet, then the value stored is null.
   */
  readonly playStackStarts: Readonly<Tuple<Rank | null, NumSuits>>;

  /** For "Throw It in a Hole" variants. All played cards go into the hole. */
  readonly hole: readonly CardOrder[];

  /** Indexed by suit index. Each suit has an array of card orders. */
  readonly discardStacks: Readonly<Tuple<readonly CardOrder[], NumSuits>>;

  readonly clues: readonly StateClue[];
  readonly stats: StatsState;
}
