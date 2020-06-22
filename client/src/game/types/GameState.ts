import StackDirection from './StackDirection';
import Variant from './Variant';

export default interface GameState {
  // For the variant, we use a string instead of the full variant object in order to keep the
  // GameState object as flat as possible (since it is cloned often)
  readonly variantName: Variant['name'];
  readonly turn: number;
  readonly log: string[];
  readonly deck: StateCard[];
  readonly deckSize: number;
  readonly score: number;
  readonly clueTokens: number;
  readonly doubleDiscard: boolean;
  readonly strikes: StateStrike[];
  readonly currentPlayerIndex: number;
  readonly hands: number[][];
  readonly playStacks: number[][];
  readonly playStacksDirections: StackDirection[];
  readonly discardStacks: number[][];
  readonly clues: StateClue[];
  readonly stats: StateStats;
}

export interface StateCard {
  readonly suit: number;
  readonly rank: number;
  readonly clues: StateCardClue[];
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
  readonly maxScore: number;
}

export type PaceRisk = 'LowRisk' | 'MediumRisk' | 'HighRisk' | 'Zero' | 'Null';
