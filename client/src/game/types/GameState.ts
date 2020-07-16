import CardState from './CardState';
import StackDirection from './StackDirection';
import StatsState from './StatsState';
import TurnState from './TurnState';

export default interface GameState {
  readonly turn: TurnState;
  readonly log: readonly LogEntry[];
  readonly deck: readonly CardState[];
  readonly deckSize: number;
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
  readonly turn: number;
  readonly order: number;
}

export interface StateClue {
  readonly type: number;
  readonly value: number;
  readonly giver: number;
  readonly target: number;
  readonly segment: number;
  readonly list: readonly number[];
  readonly negativeList: readonly number[];
}

export interface StateCardClue {
  readonly type: number;
  readonly value: number;
  readonly positive: boolean;
}

export type PaceRisk = 'LowRisk' | 'MediumRisk' | 'HighRisk' | 'Zero' | 'Null';
