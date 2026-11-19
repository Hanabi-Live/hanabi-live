// Moving between the lobby and the screens that show past games and other scores.

import type { GameSummary } from "@hanabi-live/data";
import { DEFAULT_PAGE_LIMIT } from "@hanabi-live/data";
import { getVariantById } from "@hanabi-live/game";
import { HISTORY_HASH, PATH } from "../constants.ts";
import { globals } from "../Globals.ts";
import { screenChanged } from "../sessionSlice.ts";
import { store } from "../store.ts";
import { setBrowserAddressBarPath } from "../utils.ts";
import {
  historyFailed,
  historyFilterChanged,
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
export const HISTORY_PAGE_SIZE = DEFAULT_PAGE_LIMIT;

/** How long to wait after the last keystroke in the filter box before applying it. */
const FILTER_DELAY_MILLISECONDS = 300;

let filterTimeout: ReturnType<typeof setTimeout> | undefined;

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
  const { filter } = store.getState().history;
  store.dispatch(historyRequested());
  globals.connection.send(
    "gameHistory",
    {
      offset,
      limit: HISTORY_PAGE_SIZE,
      ...(filter !== "" && { filter }),
    },
    (reply) => {
      store.dispatch(
        reply.ok
          ? historyReceived({
              filter,
              page: reply.data,
            })
          : historyFailed(filter),
      );
    },
  );
}

/** Shows only the games that the text finds, once the typing pauses. */
export function filterHistory(text: string): void {
  clearTimeout(filterTimeout);
  filterTimeout = setTimeout(() => {
    const filter = text.trim();
    if (filter === store.getState().history.filter) {
      return;
    }
    store.dispatch(historyFilterChanged(filter));
    requestPage(0);
  }, FILTER_DELAY_MILLISECONDS);
}

/**
 * Whether the filter of our history finds a game: whether the name of its variant or of one of the
 * other players contains the filter, ignoring case. The server matches the same way.
 */
export function historyFilterFinds(
  game: GameSummary,
  filter: string,
  username: string,
): boolean {
  if (filter === "") {
    return true;
  }
  const text = filter.toLowerCase();
  return (
    getVariantById(game.options.variantId).name.toLowerCase().includes(text)
    || game.playerNames.some(
      (name) => name !== username && name.toLowerCase().includes(text),
    )
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
    shown === undefined
    || store.getState().session.screen !== Screen.HistoryOtherScores
    || shown.loading
  ) {
    return;
  }

  store.dispatch(moreOtherScoresRequested());
  requestOtherScoresPage(shown.seed, shown.games.length);
}

function requestOtherScoresPage(seed: string, offset: number) {
  globals.connection.send(
    "seedGames",
    {
      seed,
      offset,
      limit: HISTORY_PAGE_SIZE,
    },
    (reply) => {
      if (reply.ok) {
        store.dispatch(
          otherScoresReceived({
            seed,
            offset,
            page: reply.data,
          }),
        );
      }
    },
  );
}

export function hideOtherScores(): void {
  store.dispatch(screenChanged(Screen.History));
  setBrowserAddressBarPath(PATH.LOBBY, HISTORY_HASH, "push");
}
