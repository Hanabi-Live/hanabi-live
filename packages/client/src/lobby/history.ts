// Moving between the lobby and the screens that show past games and other scores.

import { DEFAULT_PAGE_LIMIT } from "@hanabi-live/data";
import { HISTORY_HASH, PATH } from "../constants.ts";
import { globals } from "../Globals.ts";
import { screenChanged } from "../sessionSlice.ts";
import { store } from "../store.ts";
import { setBrowserAddressBarPath } from "../utils.ts";
import {
  historyReceived,
  historyRequested,
  moreOtherScoresRequested,
  otherScoresReceived,
  otherScoresRequested,
  selectShownGameCount,
} from "./gameHistory/historySlice.ts";
import { getOtherScoresHash } from "./historyHash.ts";
import { Screen } from "./types/Screen.ts";

/**
 * The number of games that each history or other scores request asks for, the same as a public
 * history page.
 */
const HISTORY_PAGE_SIZE = DEFAULT_PAGE_LIMIT;

export function show(requestHistory = true): void {
  store.dispatch(screenChanged(Screen.History));
  if (
    globalThis.location.pathname === PATH.LOBBY
    && globalThis.location.hash === ""
  ) {
    setBrowserAddressBarPath(PATH.LOBBY, HISTORY_HASH);
  }

  if (requestHistory) {
    requestPage(0);
  }
}

/** Asks for the next page of our history. */
export function showMore(): void {
  if (store.getState().session.screen === Screen.History) {
    requestPage(selectShownGameCount(store.getState()));
  }
}

function requestPage(offset: number) {
  store.dispatch(historyRequested());
  globals.connection.send(
    "gameHistory",
    { offset, limit: HISTORY_PAGE_SIZE },
    (reply) => {
      // A failed page adds no games.
      store.dispatch(historyReceived(reply.ok ? reply.data.games : []));
    },
  );
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
  store.dispatch(otherScoresRequested(seed));
  requestOtherScoresPage(seed, 0);

  store.dispatch(screenChanged(Screen.HistoryOtherScores));
}

/** Asks for the next page of the other scores that we show. */
export function showMoreOtherScores(): void {
  const shown = store.getState().history.otherScores;
  if (
    store.getState().session.screen === Screen.HistoryOtherScores
    && shown !== undefined
    && !shown.loading
  ) {
    store.dispatch(moreOtherScoresRequested());
    requestOtherScoresPage(shown.seed, shown.games.length);
  }
}

function requestOtherScoresPage(seed: string, offset: number) {
  globals.connection.send(
    "seedGames",
    { seed, offset, limit: HISTORY_PAGE_SIZE },
    (reply) => {
      if (reply.ok) {
        store.dispatch(otherScoresReceived({ seed, offset, page: reply.data }));
      }
    },
  );
}

export function hideOtherScores(): void {
  store.dispatch(screenChanged(Screen.History));
  setBrowserAddressBarPath(PATH.LOBBY, HISTORY_HASH, "push");
}
