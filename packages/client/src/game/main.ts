// The Hanabi game UI.

import { HISTORY_HASH, PATH } from "../constants.ts";
import {
  fadeIn,
  hideElement,
  holdElement,
  releaseElement,
  revealElement,
} from "../elementVisibility.ts";
import { globals } from "../Globals.ts";
import { scrollLobbyChatToBottom } from "../lobby/chat/LobbyChat.tsx";
import * as lobbyPage from "../lobby/lobbyPage.ts";
import { Screen } from "../lobby/types/Screen.ts";
import * as modals from "../modals.ts";
import { screenChanged } from "../sessionSlice.ts";
import * as startupScreen from "../startupScreen.ts";
import { store } from "../store.ts";
import * as tooltips from "../tooltips.ts";
import { getHtmlElement, setBrowserAddressBarPath } from "../utils.ts";
import * as clock from "./clock.ts";
import { gameChatCleared } from "./gameChatSlice.ts";
import { loadGameInit } from "./gameCommands.ts";
import { releaseGameObservers } from "./gameObservers.ts";
import * as gameSession from "./gameSession.ts";
import * as newUi from "./newUi/newUi.ts";
import { setPlayStartSound } from "./soundEffects.ts";
import { abortEffectTimelines } from "./ui/fireworks.ts";
import { HanabiUi } from "./ui/HanabiUi.ts";
import * as keyboard from "./ui/keyboard.ts";
import { StateObserver } from "./ui/reactive/StateObserver.ts";
import { drawConnections } from "./ui/serverUpdates.ts";
import * as timer from "./ui/timer.ts";
import { resetGlobals, globals as uiGlobals } from "./ui/UiGlobals.ts";
import { uiInit } from "./ui/uiInit.ts";

/** The history screen's address (such as "#history"), if a replay was opened from one. */
let historyHash = "";

/** The screen that a game or replay returns to: the lobby, or the history screen it came from. */
let screenBeforeGame = Screen.Lobby;

export function init(): void {
  const gameElement = getHtmlElement("#game");
  for (const type of ["mouseenter", "mouseleave"]) {
    gameElement.addEventListener(type, () => {
      if (globals.ui !== undefined) {
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
  const { hash, pathname } = globalThis.location;
  historyHash =
    pathname === PATH.LOBBY && hash.startsWith(HISTORY_HASH) ? hash : "";

  tooltips.clearPlayerTimeTooltips();
  lobbyPage.hide();
  screenBeforeGame = store.getState().session.screen;
  store.dispatch(screenChanged(Screen.Game));
  document.body.dataset["screen"] = "game";
  // When the page loads, the login screen's wait stays up while the game draws itself out of sight.
  // "revealHeldGame" shows it.
  const held = startupScreen.isWaiting();
  if (!held) {
    hideElement(getHtmlElement("#page-wrapper")); // We can't fade this out as it will overlap
  }
  store.dispatch(gameChatCleared()); // Clear the in-game chat box of any previous content
  document.body.addEventListener("contextmenu", preventContextMenu);

  // Every time a new game is opened, the UI is rebuilt from scratch.
  gameSession.openGame();
  clock.reset();
  setPlayStartSound(justStarted);
  // A new table can open without closing the previous game, whose effects would outlive its state.
  abortEffectTimelines();
  resetGlobals();
  if (store.getState().session.settings.newUi) {
    newUi.mount();
  } else {
    fadeIn(getHtmlElement("#game"));
    globals.ui = new HanabiUi();
  }
  if (held) {
    holdElement(getHtmlElement("#game-new-ui"));
    holdElement(getHtmlElement("#game"));
  }

  // Request what we need to start drawing the UI, such as the number of players and the variant. We
  // request the game's state once the UI is drawn.
  loadGameInit(globals.connection, globals.joinedTableId);
}

/**
 * Replaces the login screen with the game that `show` drew out of sight, once it shows its state.
 */
export function revealHeldGame(): void {
  hideElement(getHtmlElement("#page-wrapper"));
  revealElement(getHtmlElement("#game-new-ui"));
  revealElement(getHtmlElement("#game"));
}

/**
 * Builds the classic screen for the open game, when a player switches to it from the New UI. If the
 * server has not described the game yet, the screen is drawn when it does.
 */
export function buildClassicScreen(): void {
  if (globals.ui !== undefined) {
    return;
  }

  const ui = new HanabiUi();
  globals.ui = ui;
  if (store.getState().game.current === undefined) {
    return;
  }

  uiInit(() => {
    uiGlobals.stateObserver = new StateObserver();
    timer.draw();
    drawConnections();
    ui.updateChatLabel();
  });
}

/** Shows the redesigned game screen in place of the classic one, for the rest of this game. */
function showNewUi() {
  // The new screen has its own chat panel, which takes the chat box from the classic chat window.
  hideElement(getHtmlElement("#game-chat-modal"));
  hideElement(getHtmlElement("#game"));
  newUi.mount();
}

/** Swaps the open game between the classic screen and the New UI. */
export function swapUi(): void {
  if (store.getState().newUi.shown) {
    newUi.switchToClassic();
  } else {
    showNewUi();
  }
}

/**
 * Closes the open game without leaving the game screen: it stops the game's observers and clocks,
 * and removes the classic screen.
 */
export function closeGame(): void {
  gameSession.closeGame();
  releaseGameObservers();
  clock.reset();
  keyboard.destroy();
  if (globals.ui === undefined) {
    return;
  }

  globals.ui.destroy();
  globals.ui = undefined;
}

/** Leaves the game screen for the screen that was open before it. */
export function hide(): void {
  // The game can close before it shows, such as when its table ends.
  startupScreen.leave();
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
    historyHash !== ""
    && store.getState().session.screen !== Screen.Lobby
    && globalThis.location.pathname === PATH.LOBBY
  ) {
    setBrowserAddressBarPath(PATH.LOBBY, historyHash);
  }
  document.body.dataset["screen"] = "lobby";

  newUi.unmount();
  closeGame();
  releaseElement(getHtmlElement("#game-new-ui"));
  releaseElement(getHtmlElement("#game"));

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
