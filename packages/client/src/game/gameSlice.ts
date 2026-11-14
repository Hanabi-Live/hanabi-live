// The state of the game that we are in, which both game screens draw.

import type { ServerEventData } from "@hanabi-live/data";
import type { UnknownAction } from "@reduxjs/toolkit";
import { createAction } from "@reduxjs/toolkit";
import { stateReducer } from "./reducers/stateReducer.ts";
import type { State } from "./types/State.ts";
import type { Action } from "./types/actions.ts";

/** Who voted to end the game, and how many votes it needs. */
export type Votes = Omit<ServerEventData["votes"], "tableId">;

interface GameSliceState {
  /**
   * The game's state. It is `undefined` from when the game screen opens until the server answers
   * "gameInitLoad", and after we leave the game.
   */
  readonly current: State | undefined;
  readonly votes: Votes | undefined;
}

const initialState: GameSliceState = {
  current: undefined,
  votes: undefined,
};

/** The server described the game, so its state starts. */
export const gameStarted = createAction<State>("game/started");

/** The game screen opened for another game, so the previous game's state goes. */
export const gameCleared = createAction("game/cleared");

/** Something happened in the game. `stateReducer` changes the game's state for it. */
export const gameUpdated = createAction<Action>("game/updated");

export const votesChanged = createAction<Votes>("game/votesChanged");

/**
 * The game's state is not a slice from `createSlice`: the game's own reducers already use Immer,
 * and they handle the game's actions, whose types come from the server's messages.
 */
export function gameSliceReducer(
  previousState: GameSliceState | undefined,
  action: UnknownAction,
): GameSliceState {
  const state = previousState ?? initialState;

  if (gameStarted.match(action)) {
    return {
      ...state,
      current: action.payload,
    };
  }

  if (gameCleared.match(action)) {
    return initialState;
  }

  if (gameUpdated.match(action)) {
    // A message can arrive after we leave the game.
    if (state.current === undefined) {
      return state;
    }

    const current = stateReducer(state.current, action.payload);
    return current === state.current
      ? state
      : {
          ...state,
          current,
        };
  }

  if (votesChanged.match(action)) {
    return {
      ...state,
      votes: action.payload,
    };
  }

  return state;
}
