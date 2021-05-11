import CardState from "./CardState";
import CardStatus from "./CardStatus";
import StackDirection from "./StackDirection";
import StatsState from "./StatsState";
import TurnState from "./TurnState";

export default interface GameState {
  readonly turn: TurnState;
  readonly log: readonly LogEntry[];
  readonly deck: readonly CardState[];
  readonly cardsRemainingInTheDeck: number;
  // Card statuses only depend on a card's identity, not the card itself,
  // so it is stored here rather than as a sub-property of CardState
  readonly cardStatus: ReadonlyArray<readonly CardStatus[]>;
  readonly score: number;
  readonly numAttemptedCardsPlayed: number; // For "Throw It in a Hole" variants
  readonly clueTokens: number;
  readonly strikes: readonly StateStrike[];
  readonly hands: ReadonlyArray<readonly number[]>;
  readonly playStacks: ReadonlyArray<readonly number[]>;
  readonly playStackDirections: readonly StackDirection[];
  readonly hole: readonly number[]; // For "Throw It in a Hole" variants
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
  // The list of cards that the clue touches
  readonly list: readonly number[];
  // The list of cards in the same hand that the clue does not touch
  readonly negativeList: readonly number[];
}

export type PaceRisk = "LowRisk" | "MediumRisk" | "HighRisk" | "Zero" | "Null";
