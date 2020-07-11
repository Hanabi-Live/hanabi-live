import CardIdentity from './CardIdentity';
import GameState from './GameState';

export default interface HypotheticalState {
  readonly ongoing: GameState;
  readonly states: readonly GameState[];
  readonly drawnCardsShown: boolean;
  readonly drawnCardsInHypothetical: readonly number[];
  // If a card is here, it is being shown with an alternate identity
  // If the alternate identity is null/null, it is shown as blank
  readonly morphedIdentities: readonly CardIdentity[];
}
