// Pausing a timed game. A player can pause the game on their turn. On another player's turn, they
// queue a pause instead, and the game pauses when their own turn starts. Any player can unpause it.
// Both game screens use these.

import { globals as lobbyGlobals } from "../Globals.ts";
import { store } from "../store.ts";
import { gameUpdated } from "./gameSlice.ts";
import { isOurSeat } from "./ourSeat.ts";
import type { State } from "./types/State.ts";

/** What pausing does now: pause the game, or queue or unqueue a pause. */
export type PauseAction = "pause" | "queue" | "unqueue";

/**
 * What the pause control does in this state, or `undefined` when it does nothing: in an untimed
 * game, when we do not play, when the game is over, and when the game is already paused.
 */
export function getPauseAction(state: State): PauseAction | undefined {
  if (
    state.metadata.options.timeControl === undefined
    || !state.playing
    || state.finished
    || state.ongoingGame.turn.currentPlayerIndex === undefined
    || state.pause.pausingPlayerIndex !== undefined
  ) {
    return undefined;
  }

  if (isOurSeat(state.ongoingGame.turn.currentPlayerIndex, state.metadata)) {
    return "pause";
  }

  return state.pause.queued ? "unqueue" : "queue";
}

/** Pauses the game on our turn. On another player's turn, it queues a pause, or unqueues it. */
export function pause(): void {
  const state = store.getState().game.current;
  const action = state === undefined ? undefined : getPauseAction(state);
  if (action === undefined) {
    return;
  }

  const tableId = lobbyGlobals.joinedTableId;
  if (action === "pause") {
    lobbyGlobals.connection.send("pause", {
      tableId,
      paused: true,
    });
    return;
  }

  // The queued pause shows at once. The server answers with the same state.
  const queued = action === "queue";
  store.dispatch(
    gameUpdated({
      type: "pauseQueue",
      queued,
    }),
  );
  lobbyGlobals.connection.send("pauseQueue", {
    tableId,
    queued,
  });
}

/** Unpauses the game. Any player can unpause it. */
export function unpause(): void {
  lobbyGlobals.connection.send("pause", {
    tableId: lobbyGlobals.joinedTableId,
    paused: false,
  });
}
