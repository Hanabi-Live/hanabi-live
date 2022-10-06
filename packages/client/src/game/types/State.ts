import CardIdentity from "./CardIdentity";
import ClientAction from "./ClientAction";
import GameMetadata from "./GameMetadata";
import GameState from "./GameState";
import NotesState from "./NotesState";
import PauseState from "./PauseState";
import ReplayState from "./ReplayState";
import Spectator from "./Spectator";
import UIState from "./UIState";

export default interface State {
  readonly visibleState: GameState | null; // Null during initialization
  readonly ongoingGame: GameState; // In a replay, this is the state of the final turn
  readonly replay: ReplayState;

  // Equal to true if we are playing in an ongoing game. Equal to false is we are spectating an
  // ongoing game, in a dedicated solo replay, or in a shared replay.
  readonly playing: boolean;

  // Equal to true if we are in a dedicated solo replay or a shared replay.
  readonly finished: boolean;

  readonly metadata: GameMetadata;

  // We don't use a Date object for dates in order to speed up state copying.
  readonly datetimeStarted: string | null;
  readonly datetimeFinished: string | null;

  readonly cardIdentities: readonly CardIdentity[];
  readonly premove: ClientAction | null;
  readonly pause: PauseState;
  readonly spectators: Spectator[];

  readonly notes: NotesState;
  readonly UI: UIState;
}
