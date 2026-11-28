// We will receive WebSocket messages / commands from the server that tell us to do things.

import type { TableId } from "@hanabi-live/data";
import { setTabAccount } from "@hanabi-live/data";
import { globals } from "../Globals.ts";
import * as gameMain from "../game/main.ts";
import { SoundType } from "../game/types/SoundType.ts";
import * as spectatorsView from "../game/ui/reactive/views/spectatorsView.ts";
import * as modals from "../modals.ts";
import { noticeHtml } from "../notice.ts";
import { ServerHandlers } from "../serverHandlers.ts";
import {
  blockedChanged,
  friendsChanged,
  settingsChanged,
  userIdChanged,
  usernameChanged,
} from "../sessionSlice.ts";
import * as sounds from "../sounds.ts";
import * as startupScreen from "../startupScreen.ts";
import { store } from "../store.ts";
import * as theme from "../theme.ts";
import { lobbyChatIntroEnded } from "./chat/lobbyChatSlice.ts";
import * as lobbyLogin from "./login.ts";
import { shouldPlayJoinSound } from "./pregame/joinSound.ts";
import * as pregame from "./pregame/pregame.ts";
import {
  gameChanged,
  returnedTableIdChanged,
  startGameCooldownChanged,
} from "./pregame/pregameSlice.ts";
import { tableChanged, tableGone, tablesListed } from "./tables/tablesSlice.ts";
import { Screen } from "./types/Screen.ts";
import * as url from "./url.ts";
import { userChanged, userLeft, usersListed } from "./users/usersSlice.ts";

/** How long the start game button stays disabled after the player count changes. */
const START_GAME_BUTTON_DISABLED_MILLISECONDS = 500;

let startGameCooldownTimeout: ReturnType<typeof setTimeout> | undefined;

// Define a command handler map.
export const lobbyCommands = new ServerHandlers();

lobbyCommands.set("lobbyStatus", (data) => {
  if (data.type !== "loading") {
    store.dispatch(lobbyChatIntroEnded());
  }
  if (data.type === "error") {
    modals.showWarning(noticeHtml(data));
  }
});

lobbyCommands.set("blocked", (data) => {
  store.dispatch(blockedChanged(data.blocked));
});

lobbyCommands.set("friends", (data) => {
  // The server has sent us a new list of our friends; store this locally.
  store.dispatch(friendsChanged([...data.friends]));

  // Since our list of friends has changed, we need to redraw the spectators of the game so that
  // users that happen to be our friend will be shown in the correct color.
  const state = store.getState().game.current;
  if (
    state !== undefined
    && store.getState().session.screen === Screen.Game
    && globals.ui !== undefined
  ) {
    spectatorsView.onSpectatorsChanged({
      spectators: state.spectators,
      finished: state.finished,
    });
  }
});

lobbyCommands.set("pregame", (data) => {
  const previous = store.getState().pregame.game;
  const previousPlayers = previous?.players;
  if (
    shouldPlayJoinSound(
      previous,
      data,
      store.getState().session.userId,
      Date.now(),
    )
  ) {
    sounds.play(SoundType.SomeoneJoined);
  }
  store.dispatch(gameChanged(data));
  globals.tableId = data.tableId;
  if (previousPlayers?.length === data.players.length) {
    return;
  }

  // Disable the start game button for a short time after the player count changes.
  clearTimeout(startGameCooldownTimeout);
  store.dispatch(startGameCooldownChanged(true));
  startGameCooldownTimeout = setTimeout(() => {
    store.dispatch(startGameCooldownChanged(false));
  }, START_GAME_BUTTON_DISABLED_MILLISECONDS);
});

lobbyCommands.set("tableJoined", (data) => {
  // Record the table ID for later.
  globals.tableId = data.tableId;

  // Transition between screens.
  if (data.stage === "pregame") {
    startupScreen.leave();
    pregame.show();
    return;
  }
  if (
    data.stage !== "replay"
    && store.getState().session.screen === Screen.PreGame
  ) {
    pregame.moveChatDraftToGame();
    pregame.hide(false);
  }
  gameMain.show(data.stage === "justStarted");
});

// Received when we leave a table, or when the server takes us out of one, such as when the owner
// kicks us or the table fails.
lobbyCommands.set("tableLeft", (data) => {
  // After we leave a table ourselves, we have already returned to the lobby or a history screen,
  // and we may have joined another table since.
  if (data.tableId !== globals.tableId) {
    return;
  }
  if (store.getState().session.screen === Screen.PreGame) {
    pregame.hide();
  } else if (store.getState().session.screen === Screen.Game) {
    gameMain.hide();
  }
  globals.tableId = undefined;
  store.dispatch(returnedTableIdChanged(undefined));
});

// Received by the client when a table is created or modified.
lobbyCommands.set("table", (data) => {
  store.dispatch(tableChanged(data));
});

// Received by the client when a table no longer has any members present.
lobbyCommands.set("tableRemoved", (data) => {
  store.dispatch(tableGone(data.tableId));

  // If we were spectating the pre-game of this table, return to the lobby.
  if (
    store.getState().session.screen === Screen.PreGame
    && globals.tableId === data.tableId
  ) {
    pregame.hide();
    globals.tableId = undefined;
  }

  // If we followed a link to this table, it no longer exists, so stay in the lobby.
  if (store.getState().session.screen === Screen.Lobby) {
    url.leaveTableLink(data.tableId);
  }
});

// Received by the client when a user connects or has a new status.
lobbyCommands.set("user", (data) => {
  store.dispatch(userChanged(data));
});

lobbyCommands.set("userRemoved", (data) => {
  store.dispatch(userLeft(data.userId));
});

// Received by the client upon first connecting.
lobbyCommands.set("welcome", (data) => {
  // Store some variables (mostly relating to our user account).
  store.dispatch(userIdChanged(data.userId));
  setTabAccount(data.userId);
  store.dispatch(usernameChanged(data.username)); // We might have logged-in with a different stylization
  globals.muted = data.muted;
  store.dispatch(settingsChanged(data.settings));
  theme.setDarkMode(data.settings.darkMode);
  store.dispatch(friendsChanged(data.friends));
  store.dispatch(blockedChanged(data.blocked));
  store.dispatch(usersListed(data.users));
  store.dispatch(tablesListed(data.tables));

  // When the page loads and we go to a table, the login screen's wait stays up until the table
  // shows. A first time user goes to the tutorial.
  if (store.getState().login.page === "login" && !data.firstTimeUser) {
    startupScreen.wait();
  } else {
    lobbyLogin.hide(data.firstTimeUser);
  }

  // After a reconnect, we can still show the pre-game of a table. The server took us out of it.
  const pregameTableId =
    store.getState().session.screen === Screen.PreGame
      ? globals.tableId
      : undefined;
  function stayInLobby(refused: boolean) {
    startupScreen.leave();
    // A request that did not reach the server goes again after the next reconnect.
    if (refused) {
      leaveStalePregame(pregameTableId);
    }
  }

  // Go to the table that we were at before we disconnected, or somewhere specific if we have
  // entered a specific URL. If the server refuses, we stay in the lobby.
  if (!url.parseAndGoto(data, stayInLobby)) {
    stayInLobby(true);
  }
});

/**
 * Leaves the pre-game screen of a table that the server did not take us back to, such as when its
 * game started without us. Otherwise, the screen would show a table that we are not at.
 */
function leaveStalePregame(tableId: TableId | undefined) {
  if (
    store.getState().session.screen !== Screen.PreGame
    || globals.tableId !== tableId
  ) {
    return;
  }
  pregame.hide();
  globals.tableId = undefined;
  store.dispatch(returnedTableIdChanged(undefined));
}
