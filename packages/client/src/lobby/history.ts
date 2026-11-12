// Moving between the lobby and the screens that show past games and other scores.

import { DEFAULT_PAGE_SIZE } from "@hanabi-live/data";
import { HISTORY_HASH, PATH } from "../constants.ts";
import { globals } from "../Globals.ts";
import { store } from "../store.ts";
import { setBrowserAddressBarPath } from "../utils.ts";
import {
  historyRequested,
  moreOtherScoresRequested,
  otherScoresRequested,
  selectShownGameCount,
} from "./gameHistory/historySlice.ts";
import { getOtherScoresHash } from "./historyHash.ts";
import { showLobbyHalves } from "./lobbyLayout.ts";
import { Screen } from "./types/Screen.ts";

/**
 * The number of games that each history or other scores request asks for, the same as a public
 * history page.
 */
const HISTORY_PAGE_SIZE = DEFAULT_PAGE_SIZE;

export function show(requestHistory = true): void {
  globals.currentScreen = Screen.History;
  if (
    globalThis.location.pathname === PATH.LOBBY
    && globalThis.location.hash === ""
  ) {
    setBrowserAddressBarPath(PATH.LOBBY, HISTORY_HASH);
  }

  $("#lobby-history-other-scores").hide();
  $("#lobby-history").show();
  showLobbyHalves(false);

  if (requestHistory) {
    requestPage(0);
  }
}

/** Asks for the next page of our history. */
export function showMore(): void {
  if (globals.currentScreen === Screen.History) {
    requestPage(selectShownGameCount(store.getState()));
  }
}

function requestPage(offset: number) {
  store.dispatch(historyRequested());
  globals.conn!.send("gameHistory", {
    offset,
    limit: HISTORY_PAGE_SIZE,
  });
}

export function hide(): void {
  globals.currentScreen = Screen.Lobby;
  setBrowserAddressBarPath(PATH.LOBBY, undefined);

  $("#lobby-history").hide();
  $("#lobby-history-other-scores").hide();
  showLobbyHalves(true);
}

/** Shows the other games on the seed of one of our games. */
export function showOtherScoresFromHistory(seed: string): void {
  showOtherScores(seed);
  setBrowserAddressBarPath(PATH.LOBBY, getOtherScoresHash(seed), "push");
}

export function showOtherScores(seed: string): void {
  store.dispatch(otherScoresRequested(seed));
  requestOtherScoresPage(seed, 0);

  globals.currentScreen = Screen.HistoryOtherScores;
  $("#lobby-history").hide();
  $("#lobby-history-other-scores").show();
}

/** Asks for the next page of the other scores that we show. */
export function showMoreOtherScores(): void {
  const shown = store.getState().history.otherScores;
  if (
    globals.currentScreen === Screen.HistoryOtherScores
    && shown !== undefined
    && !shown.loading
  ) {
    store.dispatch(moreOtherScoresRequested());
    requestOtherScoresPage(shown.seed, shown.games.length);
  }
}

function requestOtherScoresPage(seed: string, offset: number) {
  globals.conn!.send("seedGames", {
    seed,
    offset,
    limit: HISTORY_PAGE_SIZE,
  });
}

export function hideOtherScores(): void {
  globals.currentScreen = Screen.History;
  setBrowserAddressBarPath(PATH.LOBBY, HISTORY_HASH, "push");
  $("#lobby-history").show();
  $("#lobby-history-other-scores").hide();
}
