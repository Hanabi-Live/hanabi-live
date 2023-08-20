import type { ColorIndex, Rank, RankClueNumber } from "@hanabi/data";
import type { DeepReadonly } from "@hanabi/utils";
import type { CardState } from "./CardState";
import type { CardStatus } from "./CardStatus";
import type { ClueType } from "./ClueType";
import type { StackDirection } from "./StackDirection";
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
  readonly cardStatus: DeepReadonly<CardStatus[][]>;

  readonly score: number;

  /** For "Throw It in a Hole" variants. */
  readonly numAttemptedCardsPlayed: number;

  readonly clueTokens: number;
  readonly strikes: readonly StateStrike[];

  /** Indexed by player index. Each player has an array of card orders. */
  readonly hands: DeepReadonly<number[][]>;

  /** Indexed by suit index. Each suit has an array of card orders. */
  readonly playStacks: DeepReadonly<number[][]>;

  readonly playStackDirections: readonly StackDirection[];

  /**
   * For Sudoku variants, this denotes the first rank played of this stack. If the stack is not
   * started yet, then the value stored is null.
   */
  readonly playStackStarts: ReadonlyArray<Rank | null>;

  /** For "Throw It in a Hole" variants. */
  readonly hole: readonly number[];

  /** Suit index --> card order */
  readonly discardStacks: DeepReadonly<number[][]>;

  readonly clues: readonly StateClue[];
  readonly stats: StatsState;
}

export interface LogEntry {
  readonly turn: number;
  readonly text: string;
}

export interface StateStrike {
  readonly segment: number;
  readonly order: number;
}

interface StateClueBase {
  readonly giver: number;
  readonly target: number;
  readonly segment: number;

  /** The list of cards that the clue touches. */
  readonly list: readonly number[];

  /** The list of cards in the same hand that the clue does not touch. */
  readonly negativeList: readonly number[];
}

interface StateColorClue extends StateClueBase {
  readonly type: ClueType.Color;
  readonly value: ColorIndex;
}

interface StateRankClue extends StateClueBase {
  readonly type: ClueType.Rank;
  readonly value: RankClueNumber;
}

export type StateClue = StateColorClue | StateRankClue;

export type PaceRisk = "LowRisk" | "MediumRisk" | "HighRisk" | "Zero" | "Null";
