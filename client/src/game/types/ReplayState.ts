import CardIdentity from './CardIdentity';
import GameState from './GameState';

export default interface ReplayState {
  readonly active: boolean;
  readonly turn: number;
  readonly states: readonly GameState[];
  readonly hypothetical: HypotheticalState | null;
}

export interface HypotheticalState {
  readonly ongoing: GameState;
  readonly states: readonly GameState[];
  readonly drawnCardsShown: boolean;
  readonly drawnCardsInHypothetical: readonly number[];
  // If a card is here, it's shown with an alternate identity
  // If the alternate identity is null/null, it's shown as blank
  readonly morphedIdentities: readonly CardIdentity[];
}
