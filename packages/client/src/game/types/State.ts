import type { CardIdentity } from "./CardIdentity";
import type { ClientAction } from "./ClientAction";
import type { GameMetadata } from "./GameMetadata";
import type { GameState } from "./GameState";
import type { NotesState } from "./NotesState";
import type { PauseState } from "./PauseState";
import type { ReplayState } from "./ReplayState";
import type { Spectator } from "./Spectator";
import type { UIState } from "./UIState";

export interface State {
  readonly visibleState: GameState | null; // Null during initialization
  readonly ongoingGame: GameState; // In a replay, this is the state of the final turn
  readonly replay: ReplayState;

  // Equal to true if we are playing in an ongoing game. Equal to false is we are spectating an
  // ongoing game, in a dedicated solo replay, or in a shared replay.
  readonly playing: boolean;

  // Equal to true if we are shadowing a player.
  readonly shadowing: boolean;

  // Equal to true if we are in a dedicated solo replay or a shared replay.
  readonly finished: boolean;

  readonly metadata: GameMetadata;

  // We do not use a `Date` object for dates in order to speed up state copying.
  readonly datetimeStarted: string | null;
  readonly datetimeFinished: string | null;

  readonly cardIdentities: readonly CardIdentity[];
  readonly premove: ClientAction | null;
  readonly pause: PauseState;
  readonly spectators: Spectator[];

  readonly notes: NotesState;
  readonly UI: UIState;
}
