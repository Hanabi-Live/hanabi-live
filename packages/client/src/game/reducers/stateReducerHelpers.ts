import type { GameAction, Perspective, PlayerIndex } from "@hanabi-live/game";
import type { Draft } from "immer";
import { current, isDraft } from "immer";
import type { State } from "../types/State.ts";

/**
 * The value of a part of the state as it is now, outside of the draft. A reducer that applies
 * several updates at once sees the earlier ones. A value that one of them put in the draft is not a
 * draft, so it is already plain.
 */
export function snapshot<T>(value: Draft<T> | T): T {
  return (isDraft(value) ? current(value as Draft<T>) : value) as T;
}

/** Where we see the game from: our seat, a seat that we shadow, or outside of the seats. */
export function getPerspective(
  state: Pick<State, "playing" | "shadowing">,
): Perspective {
  return state.playing || state.shadowing ? "seat" : "spectator";
}

/**
 * When the game state reducer sets "segment" to a new number, it is a signal to record the current
 * state of the game (for the purposes of replays).
 */
export function shouldStoreSegment(
  segment: number | undefined,
  previousSegment: number | undefined,
  action: GameAction,
): boolean {
  if (segment === undefined) {
    // The game is still doing the initial deal.
    return false;
  }

  // The types of "gameOver" that have to do with the previous action should meld together with the
  // segment of the previous action. Any new end conditions must also be updated in the "gameOver"
  // block in "turnReducer.ts".
  if (
    action.type === "gameOver"
    && action.endCondition !== "timeout"
    && action.endCondition !== "terminatedByPlayer"
    && action.endCondition !== "terminatedByVote"
    && action.endCondition !== "idleTimeout"
  ) {
    return true;
  }

  // By default, store a new segment whenever the turn reducer changes the segment number.
  return segment !== previousSegment;
}

/** The names of the players in these seats. The server names players by seat. */
export function playerNamesAt(
  playerNames: readonly string[],
  seats: readonly PlayerIndex[],
): readonly string[] {
  return seats.map((seat) => playerNames[seat] ?? "");
}
