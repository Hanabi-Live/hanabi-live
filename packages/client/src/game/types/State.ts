import type { Spectator } from "@hanabi-live/data";
import type { CardIdentity, GameMetadata, GameState } from "@hanabi-live/game";
import type { ClientAction } from "./ClientAction.ts";
import type { NotesState } from "./NotesState.ts";
import type { PauseState } from "./PauseState.ts";
import type { ReplayState } from "./ReplayState.ts";

export interface State {
  readonly visibleState: GameState | undefined; // Null during initialization
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
  readonly startedAt: string | undefined;
  readonly finishedAt: string | undefined;

  readonly cardIdentities: readonly CardIdentity[];
  readonly premove: ClientAction | undefined;
  readonly pause: PauseState;
  readonly spectators: Spectator[];

  readonly notes: NotesState;
}
