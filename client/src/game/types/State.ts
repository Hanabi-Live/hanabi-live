import CardIdentity from './CardIdentity';
import GameMetadata from './GameMetadata';
import GameState from './GameState';
import PremoveState from './PremoveState';
import ReplayState from './ReplayState';

export default interface State {
  readonly visibleState: GameState | null; // Null during initialization
  readonly ongoingGame: GameState; // In a replay, this is the state of the final turn
  readonly replay: ReplayState;
  readonly cardIdentities: readonly CardIdentity[];
  readonly metadata: GameMetadata;
  readonly premove: PremoveState;
}
