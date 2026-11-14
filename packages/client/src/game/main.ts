// The Hanabi game UI.

import { HISTORY_HASH, PATH } from "../constants.ts";
import { fadeIn, hideElement } from "../elementVisibility.ts";
import { globals } from "../Globals.ts";
import { scrollLobbyChatToBottom } from "../lobby/chat/LobbyChat.tsx";
import * as lobbyPage from "../lobby/lobbyPage.ts";
import { Screen } from "../lobby/types/Screen.ts";
import * as modals from "../modals.ts";
import { screenChanged } from "../sessionSlice.ts";
import { store } from "../store.ts";
import * as tooltips from "../tooltips.ts";
import { getHtmlElement, setBrowserAddressBarPath } from "../utils.ts";
import * as clock from "./clock.ts";
import { gameChatCleared } from "./gameChatSlice.ts";
import { releaseGameObservers } from "./gameObservers.ts";
import * as gameSession from "./gameSession.ts";
import * as newUi from "./newUi/newUi.ts";
import { setPlayStartSound } from "./soundEffects.ts";
import { loadGameInit } from "./ui/gameCommands.ts";
import { HanabiUi } from "./ui/HanabiUi.ts";

/** The history screen's address (e.g. "#history"), if a replay was opened from one. */
let historyHash = "";

/** The screen that a game or replay returns to: the lobby, or the history screen it came from. */
let screenBeforeGame = Screen.Lobby;

export function init(): void {
  const gameElement = getHtmlElement("#game");
  for (const type of ["mouseenter", "mouseleave"]) {
    gameElement.addEventListener(type, () => {
      if (
        store.getState().session.screen === Screen.Game
        && globals.ui !== undefined
      ) {
        globals.ui.focusLost();
      }
    });
  }
}

/** Keeps the browser's menu from opening when a player right-clicks the game screen. */
function preventContextMenu(event: MouseEvent) {
  event.preventDefault();
}

export function show(justStarted: boolean): void {
  const { pathname, hash } = globalThis.location;
  historyHash =
    pathname === PATH.LOBBY && hash.startsWith(HISTORY_HASH) ? hash : "";

  tooltips.clearPlayerTimeTooltips();
  lobbyPage.hide();
  screenBeforeGame = store.getState().session.screen;
  store.dispatch(screenChanged(Screen.Game));
  document.body.dataset["screen"] = "game";
  hideElement(getHtmlElement("#page-wrapper")); // We can't fade this out as it will overlap
  store.dispatch(gameChatCleared()); // Clear the in-game chat box of any previous content
  document.body.addEventListener("contextmenu", preventContextMenu);
  // The classic screen keeps running underneath the redesigned one, hidden.
  if (!store.getState().session.settings.newUi) {
    fadeIn(getHtmlElement("#game"));
  }

  // Every time a new game is opened, the UI is rebuilt from scratch.
  gameSession.openGame();
  clock.reset();
  setPlayStartSound(justStarted);
  globals.ui = new HanabiUi();
  if (store.getState().session.settings.newUi) {
    newUi.mount();
  }

  // Request what we need to start drawing the UI, such as the number of players and the variant. We
  // request the game's state once the UI is drawn.
  loadGameInit(globals.connection, globals.joinedTableId);
}

/** Shows the redesigned game screen in place of the classic one, for the rest of this game. */
export function showNewUi(): void {
  // The new screen has its own chat panel, which takes the chat box from the classic chat window.
  hideElement(getHtmlElement("#game-chat-modal"));
  hideElement(getHtmlElement("#game"));
  newUi.mount();
}

/**
 * Closes the open game without leaving the game screen: it stops the game's observers and clocks,
 * and removes the classic screen.
 */
export function closeGame(): void {
  gameSession.closeGame();
  releaseGameObservers();
  clock.reset();
  if (globals.ui !== undefined) {
    globals.ui.destroy();
    globals.ui = undefined;
  }
}

/** Leaves the game screen for the screen that was open before it. */
export function hide(): void {
  modals.closeIdleWarning();

  // We could be going back to one of the history screens, since we can enter a solo replay from
  // them.
  store.dispatch(
    screenChanged(
      screenBeforeGame === Screen.History
        || screenBeforeGame === Screen.HistoryOtherScores
        ? screenBeforeGame
        : Screen.Lobby,
    ),
  );
  if (
    store.getState().session.screen !== Screen.Lobby
    && historyHash !== ""
    && globalThis.location.pathname === PATH.LOBBY
  ) {
    setBrowserAddressBarPath(PATH.LOBBY, historyHash);
  }
  document.body.dataset["screen"] = "lobby";

  newUi.unmount();
  closeGame();

  hideElement(getHtmlElement("#game")); // We can't fade this out as it will overlap
  document.body.removeEventListener("contextmenu", preventContextMenu);
  fadeIn(getHtmlElement("#page-wrapper"));

  // Make sure that there are not any game-related modals showing.
  hideElement(getHtmlElement("#game-chat-modal"));

  // Make sure that there are not any game-related tooltips showing.
  tooltips.closeAllTooltips();

  // Scroll to the bottom of the chat.
  scrollLobbyChatToBottom();
}
