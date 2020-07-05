import CardState from './CardState';
import StackDirection from './StackDirection';

export default interface GameState {
  readonly turn: number;
  readonly currentPlayerIndex: number;
  readonly log: readonly LogEntry[];
  readonly deck: readonly CardState[];
  readonly deckSize: number;
  readonly score: number;
  readonly maxScore: number;
  readonly clueTokens: number;
  readonly doubleDiscard: boolean;
  readonly strikes: readonly StateStrike[];
  readonly hands: ReadonlyArray<readonly number[]>;
  readonly playStacks: ReadonlyArray<readonly number[]>;
  readonly playStacksDirections: readonly StackDirection[];
  readonly discardStacks: ReadonlyArray<readonly number[]>;
  readonly clues: readonly StateClue[];
  readonly stats: StateStats;
  readonly cardsPlayedOrDiscardedThisTurn: number;
}
export interface LogEntry {
  readonly turn: number;
  readonly text: string;
}

export interface StateStrike {
  readonly order: number;
  readonly turn: number;
}

export interface StateClue {
  readonly type: number;
  readonly value: number;
  readonly giver: number;
  readonly target: number;
  readonly turn: number;
  readonly list: readonly number[];
  readonly negativeList: readonly number[];
}

export interface StateCardClue {
  readonly type: number;
  readonly value: number;
  readonly positive: boolean;
}

export interface StateStats {
  readonly cardsGotten: number;
  readonly potentialCluesLost: number;
  readonly efficiency: number;
  readonly pace: number | null;
  readonly paceRisk: PaceRisk;
}

export type PaceRisk = 'LowRisk' | 'MediumRisk' | 'HighRisk' | 'Zero' | 'Null';
