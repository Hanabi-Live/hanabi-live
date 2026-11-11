// Shows and hides the pre-game screen.

import { globals } from "../../Globals.ts";
import * as chat from "../../chat.ts";
import { PATH } from "../../constants.ts";
import { creatingTableChanged } from "../../sessionSlice.ts";
import { store } from "../../store.ts";
import { getHTMLInputElement, setBrowserAddressBarPath } from "../../utils.ts";
import { scrollLobbyChatToBottom } from "../chat/LobbyChat.tsx";
import * as lobbyPage from "../lobbyPage.ts";
import { Screen } from "../types/Screen.ts";
import { PREGAME_CHAT_INPUT_ID } from "./PregameChat.tsx";
import { pregameChatCleared, typingCleared } from "./pregameSlice.ts";

export function show(): void {
  lobbyPage.hide();
  globals.currentScreen = Screen.PreGame;

  // Replace the list of current games with a list of the current players.
  $("#lobby-pregame").show();
  $("#lobby-games").hide();
  // Fix online and chat boxes layout for small screens.
  $("#lobby-chat-container").addClass("pregame-chat-layout");
  $("#lobby-chat-pregame-container").addClass("pregame-chat-layout");

  // Fix bottom nav buttons for small screens.
  $("#lobby-toggle-show-tables").text("Game");
  $("#lobby-toggle-show-chat").addClass("hidden");
  $("#lobby-toggle-show-game-chat").removeClass("hidden");

  // Click the games button.
  $("#lobby-toggle-show-tables").trigger("click");

  // Add an extra chat box.
  $("#lobby-chat-container").removeClass("col-8");
  $("#lobby-chat-container").addClass("col-4");
  $("#lobby-chat-pregame-container").removeClass("hidden");

  // Clear the pregame chat box of any previous content.
  store.dispatch(pregameChatCleared());

  // Scroll to the bottom of the lobby chat. (Even if it is already at the bottom, it will change
  // size and cause it to not be scrolled all the way down.)
  scrollLobbyChatToBottom();

  // Focus the pregame chat.
  getHTMLInputElement(`#${PREGAME_CHAT_INPUT_ID}`).focus();

  // The "Create Game" button in the nav was disabled after we clicked the "Create" button, so
  // re-enable it now that we have received a message back from the server.
  store.dispatch(creatingTableChanged(false));

  // Set the browser address bar.
  setBrowserAddressBarPath(
    `${PATH.PRE_GAME}/${globals.tableId}`,
    undefined,
    globalThis.location.pathname === PATH.LOBBY ? "push" : "replace",
  );
}

export function hide(updateURL = true): void {
  lobbyPage.hide();
  globals.currentScreen = Screen.Lobby;

  // Replace the list of current players with a list of the current games.
  $("#lobby-pregame").hide();
  $("#lobby-games").show();
  // Fix online and chat boxes layout for small screens.
  $("#lobby-chat-container").removeClass("pregame-chat-layout");
  $("#lobby-chat-pregame-container").removeClass("pregame-chat-layout");

  // Fix bottom nav buttons for small screens.
  $("#lobby-toggle-show-tables").text("Tables");
  $("#lobby-toggle-show-chat").removeClass("hidden");
  $("#lobby-toggle-show-game-chat").addClass("hidden");

  // Click the games button.
  $("#lobby-toggle-show-tables").trigger("click");

  // Remove the extra chat box.
  $("#lobby-chat-container").addClass("col-8");
  $("#lobby-chat-container").removeClass("col-4");
  $("#lobby-chat-pregame-container").addClass("hidden");

  // Clear the typing list.
  store.dispatch(typingCleared());
  chat.updatePeopleTyping();

  // Set the browser address bar.
  if (updateURL) {
    setBrowserAddressBarPath(PATH.LOBBY);
  }
}
