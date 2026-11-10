// Shows and hides the pre-game screen, and enables its buttons in the navigation bar.

import { MAX_PLAYERS, MIN_PLAYERS } from "@hanabi-live/game";
import { globals } from "../../Globals";
import * as chat from "../../chat";
import { PATH } from "../../constants";
import { store } from "../../store";
import { getHTMLInputElement, setBrowserAddressBarPath } from "../../utils";
import { scrollLobbyChatToBottom } from "../chat/LobbyChat";
import * as lobbyPage from "../lobbyPage";
import * as nav from "../nav";
import { Screen } from "../types/Screen";
import { PREGAME_CHAT_INPUT_ID } from "./PregameChat";
import { pregameChatCleared, typingCleared } from "./pregameSlice";

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
  $("#nav-buttons-lobby-create-game").removeClass("disabled");

  // Adjust the top navigation bar.
  nav.show("pregame");
  toggleStartGameButton();
  toggleJoinSpectateButtons();

  // Set the browser address bar.
  setBrowserAddressBarPath(
    `${PATH.PRE_GAME}/${globals.tableID}`,
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

  // Adjust the navigation bar.
  nav.show("lobby");

  // Set the browser address bar.
  if (updateURL) {
    setBrowserAddressBarPath(PATH.LOBBY);
  }
}

function isSpectator() {
  for (const loopPlayer of globals.game!.players) {
    if (loopPlayer.username === globals.username) {
      return false;
    }
  }
  return true;
}

export function toggleStartGameButton(): void {
  // Enable or disable the "Start Game" button. "Start Game" enabled if game owner and enough
  // players.
  $("#nav-buttons-pregame-start").addClass("disabled");

  if (globals.game === undefined) {
    return;
  }

  if (
    globals.game.ownerID === globals.userID
    && globals.game.players.length >= MIN_PLAYERS
    && globals.game.players.length <= MAX_PLAYERS
    // If this field is not equal to undefined it means that we are waiting a short time to
    // re-enable the button after a player joined.
    && globals.enableStartGameButtonTimeout === undefined
  ) {
    $("#nav-buttons-pregame-start").removeClass("disabled");
  }
}

export function toggleJoinSpectateButtons(): void {
  if (globals.game === undefined) {
    return;
  }

  const joinGame = $("#nav-buttons-pregame-join");
  const joinSpectate = $("#nav-buttons-pregame-spectate");

  joinGame.addClass("disabled");
  joinSpectate.addClass("disabled");

  if (isSpectator()) {
    joinSpectate.hide();
    joinGame.show();

    if (globals.game.players.length < globals.game.settings.maxPlayers) {
      joinGame.removeClass("disabled");
    }
  } else {
    joinGame.hide();
    joinSpectate.show();

    if (globals.game.players.length >= MIN_PLAYERS) {
      joinSpectate.removeClass("disabled");
    }
  }
}
