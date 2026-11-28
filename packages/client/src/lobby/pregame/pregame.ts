// Shows and hides the pre-game screen.

import { globals } from "../../Globals.ts";
import { setChatInputText } from "../../chat.ts";
import { PATH } from "../../constants.ts";
import { GAME_CHAT_INPUT_ID } from "../../game/GameChatBox.tsx";
import {
  creatingTableChanged,
  lobbyPanelChanged,
  screenChanged,
} from "../../sessionSlice.ts";
import { store } from "../../store.ts";
import { setBrowserAddressBarPath } from "../../utils.ts";
import * as lobbyPage from "../lobbyPage.ts";
import { Screen } from "../types/Screen.ts";
import { PREGAME_CHAT_INPUT_ID } from "./PregameChat.tsx";
import {
  gameChanged,
  pregameChatCleared,
  typingCleared,
} from "./pregameSlice.ts";

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

  // What we typed belongs to this table, so it does not carry over to the next one.
  setChatInputText(PREGAME_CHAT_INPUT_ID, "");
  store.dispatch(screenChanged(Screen.Lobby));

  // Small screens show the tables first.
  store.dispatch(lobbyPanelChanged("tables"));

  // Clear the typing list.
  store.dispatch(typingCleared());

  // We no longer see the table, so what we know about it is out of date.
  store.dispatch(gameChanged(undefined));

  // Set the browser address bar.
  if (updateUrl) {
    setBrowserAddressBarPath(PATH.LOBBY);
  }
}

/** Moves what we typed in the pre-game chat to the game chat, when the game starts. */
export function moveChatDraftToGame(): void {
  const text =
    document.querySelector<HTMLInputElement>(`#${PREGAME_CHAT_INPUT_ID}`)?.value
    ?? "";
  setChatInputText(GAME_CHAT_INPUT_ID, text);
  setChatInputText(PREGAME_CHAT_INPUT_ID, "");
}
