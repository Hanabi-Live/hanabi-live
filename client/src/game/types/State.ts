import CardIdentity from './CardIdentity';
import GameMetadata from './GameMetadata';
import GameState from './GameState';
import ReplayState from './ReplayState';

export default interface State {
  readonly visibleState: GameState;
  readonly ongoingGame: GameState;
  readonly replay: ReplayState;
  readonly cardIdentities: CardIdentity[];
  readonly metadata: GameMetadata;
}
