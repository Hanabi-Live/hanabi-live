// Moving between the lobby and the screens that show past games and other scores.

import { HISTORY_HASH, PATH } from "../constants.ts";
import { screenChanged } from "../sessionSlice.ts";
import { store } from "../store.ts";
import { setBrowserAddressBarPath } from "../utils.ts";
import { otherScoresShown } from "./gameHistory/historySlice.ts";
import { getOtherScoresHash } from "./historyHash.ts";
import { Screen } from "./types/Screen.ts";

/** Shows our past games. The list loads when the screen opens. */
export function show(): void {
  store.dispatch(screenChanged(Screen.History));
  if (
    globalThis.location.pathname === PATH.LOBBY
    && globalThis.location.hash === ""
  ) {
    setBrowserAddressBarPath(PATH.LOBBY, HISTORY_HASH);
  }
}

export function hide(): void {
  store.dispatch(screenChanged(Screen.Lobby));
  setBrowserAddressBarPath(PATH.LOBBY, undefined);
}

/** Shows the other games on the seed of one of our games. */
export function showOtherScoresFromHistory(seed: string): void {
  showOtherScores(seed);
  setBrowserAddressBarPath(PATH.LOBBY, getOtherScoresHash(seed), "push");
}

export function showOtherScores(seed: string): void {
  store.dispatch(otherScoresShown(seed));
  store.dispatch(screenChanged(Screen.HistoryOtherScores));
}

export function hideOtherScores(): void {
  store.dispatch(screenChanged(Screen.History));
  setBrowserAddressBarPath(PATH.LOBBY, HISTORY_HASH, "push");
}
