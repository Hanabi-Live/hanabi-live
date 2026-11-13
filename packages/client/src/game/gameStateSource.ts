// The game's state, as the classic screen's observers read it from the store.

import { store } from "../store.ts";
import type { State } from "./types/State.ts";

export interface StateSource<S> {
  /** `undefined` while there is no state to observe. */
  readonly getState: () => S | undefined;
  readonly subscribe: (listener: () => void) => () => void;
}

export const gameStateSource: StateSource<State> = {
  getState: () => store.getState().game.current,
  subscribe: (listener) => store.subscribe(listener),
};
