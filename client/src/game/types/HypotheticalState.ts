import CardIdentity from './CardIdentity';
import GameState from './GameState';

export default interface HypotheticalState {
  readonly ongoing: GameState;
  // The "states" array will have 1 element if we have entered a hypothetical but not made any moves
  // yet, 2 elements if we have made 1 move, etc.
  readonly states: readonly GameState[];
  readonly drawnCardsShown: boolean;
  readonly drawnCardsInHypothetical: readonly number[];
  // If a card is here, it is being shown with an alternate identity
  // If the alternate identity is null/null, it is shown as blank
  readonly morphedIdentities: readonly CardIdentity[];
}
