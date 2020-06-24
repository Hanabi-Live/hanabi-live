import GameState from './GameState';
import Options from './Options';
import ReplayState from './ReplayState';

export default interface State {
  readonly visibleState: GameState;
  readonly ongoingGame: GameState;
  readonly replay: ReplayState;
  readonly options: Options;
}
