import GameState from './GameState';
import ReplayState from './ReplayState';

export default interface State {
  readonly visibleState: GameState;
  readonly ongoingGame: GameState;
  readonly replay: ReplayState;
}
