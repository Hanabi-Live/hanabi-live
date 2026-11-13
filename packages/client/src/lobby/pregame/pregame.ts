// Shows and hides the pre-game screen.

import { globals } from "../../Globals.ts";
import { PATH } from "../../constants.ts";
import {
  creatingTableChanged,
  lobbyPanelChanged,
  screenChanged,
} from "../../sessionSlice.ts";
import { store } from "../../store.ts";
import { setBrowserAddressBarPath } from "../../utils.ts";
import * as lobbyPage from "../lobbyPage.ts";
import { Screen } from "../types/Screen.ts";
import { pregameChatCleared, typingCleared } from "./pregameSlice.ts";

export function show(): void {
  lobbyPage.hide();
  store.dispatch(screenChanged(Screen.PreGame));

  // Small screens show the table first.
  store.dispatch(lobbyPanelChanged("tables"));

  // Clear the pregame chat box of any previous content.
  store.dispatch(pregameChatCleared());

  // The "Create Game" button in the nav was disabled after we clicked the "Create" button, so
  // re-enable it now that we have received a message back from the server.
  store.dispatch(creatingTableChanged(false));

  // Set the browser address bar.
  setBrowserAddressBarPath(
    `${PATH.PRE_GAME}/${globals.joinedTableId}`,
    undefined,
    globalThis.location.pathname === PATH.LOBBY ? "push" : "replace",
  );
}

export function hide(updateUrl = true): void {
  lobbyPage.hide();
  store.dispatch(screenChanged(Screen.Lobby));

  // Small screens show the tables first.
  store.dispatch(lobbyPanelChanged("tables"));

  // Clear the typing list.
  store.dispatch(typingCleared());

  // Set the browser address bar.
  if (updateUrl) {
    setBrowserAddressBarPath(PATH.LOBBY);
  }
}
