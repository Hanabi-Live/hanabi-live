// Full pages in the lobby (such as "Create Game" and "Resources"), which replace the lobby until
// the user submits them or returns. "LobbyPages.tsx" shows the page that the store names.

import { lobbyPageChanged } from "../sessionSlice.ts";
import { store } from "../store.ts";
import { showLobbyHalves } from "./lobbyLayout.ts";
import type { LobbyPage } from "./types/LobbyPage.ts";

/** Shows a page from the lobby or from the pre-game screen, which it returns to. */
export function show(page: LobbyPage): void {
  store.dispatch(lobbyPageChanged(page));
  showLobbyHalves(false);
}

export function hide(): void {
  if (!isShown()) {
    return;
  }

  store.dispatch(lobbyPageChanged(undefined));
  showLobbyHalves(true);
}

export function isShown(): boolean {
  return store.getState().session.lobbyPage !== undefined;
}
