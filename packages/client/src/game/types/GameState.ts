import type { CardState } from "./CardState";
import type { CardStatus } from "./CardStatus";
import type { StackDirection } from "./StackDirection";
import type { StatsState } from "./StatsState";
import type { TurnState } from "./TurnState";

export interface GameState {
  readonly turn: TurnState;
  readonly log: readonly LogEntry[];
  readonly deck: readonly CardState[];
  readonly cardsRemainingInTheDeck: number;

  /**
   * This only depends on a card's identity, not the card itself, so it is stored here rather than
   * as a sub-property of `CardState`.
   */
  readonly cardStatus: ReadonlyArray<readonly CardStatus[]>;

  readonly score: number;

  /** For "Throw It in a Hole" variants. */
  readonly numAttemptedCardsPlayed: number;

  readonly clueTokens: number;
  readonly strikes: readonly StateStrike[];
  readonly hands: ReadonlyArray<readonly number[]>;
  readonly playStacks: ReadonlyArray<readonly number[]>;
  readonly playStackDirections: readonly StackDirection[];

  /**
   * For Sudoku variants, this denotes the first rank played of this stack. If the stack is not
   * started yet, then the value stored is `UNKNOWN_CARD_RANK`.
   */
  readonly playStackStarts: readonly number[];

  /** For "Throw It in a Hole" variants. */
  readonly hole: readonly number[];

  readonly discardStacks: ReadonlyArray<readonly number[]>;
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

export interface StateClue {
  readonly type: number;
  readonly value: number;
  readonly giver: number;
  readonly target: number;
  readonly segment: number;

  /** The list of cards that the clue touches. */
  readonly list: readonly number[];

  /** The list of cards in the same hand that the clue does not touch. */
  readonly negativeList: readonly number[];
}

export type PaceRisk = "LowRisk" | "MediumRisk" | "HighRisk" | "Zero" | "Null";
