import CardIdentity from './CardIdentity';
import ClientAction from './ClientAction';
import GameMetadata from './GameMetadata';
import GameState from './GameState';
import PauseState from './PauseState';
import ReplayState from './ReplayState';
import Spectator from './Spectator';

export default interface State {
  readonly visibleState: GameState | null; // Null during initialization
  readonly ongoingGame: GameState; // In a replay, this is the state of the final turn
  readonly replay: ReplayState;

  // Equal to true if we are playing in an ongoing game
  // Equal to false is we are spectating an ongoing game, in a dedicated solo replay,
  // or in a shared replay
  readonly playing: boolean;

  // Equal to true if we are in a dedicated solo replay or a shared replay
  readonly finished: boolean;

  readonly metadata: GameMetadata;
  readonly cardIdentities: readonly CardIdentity[];
  readonly premove: ClientAction | null;
  readonly pause: PauseState;
  readonly spectators: Spectator[];
}
