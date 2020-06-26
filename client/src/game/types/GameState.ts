import StackDirection from './StackDirection';

export default interface GameState {
  readonly turn: number;
  readonly currentPlayerIndex: number;
  readonly log: readonly string[];
  readonly deck: readonly StateCard[];
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
}

export interface StateCard {
  readonly suit: number;
  readonly rank: number;
  readonly clues: readonly StateCardClue[];
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
