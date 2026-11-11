// We will receive WebSocket messages / commands from the server that tell us to do things.

import { setTabAccount } from "@hanabi-live/data";
import { globals } from "../Globals.ts";
import { NO_TABLE_ID } from "../constants.ts";
import * as gameMain from "../game/main.ts";
import * as spectatorsView from "../game/ui/reactive/views/spectatorsView.ts";
import * as modals from "../modals.ts";
import { ServerHandlers } from "../serverHandlers.ts";
import * as sounds from "../sounds.ts";
import { store } from "../store.ts";
import * as theme from "../theme.ts";
import { toSoundType } from "../wire.ts";
import {
  historyReceived,
  lobbyStatusReceived,
  otherScoresReceived,
} from "./gameHistory/historySlice.ts";
import * as lobbyLogin from "./login.ts";
import * as pregame from "./pregame/pregame.ts";
import { startGameCooldownChanged } from "./pregame/pregameSlice.ts";
import { tableChanged, tableGone, tablesListed } from "./tables/tablesSlice.ts";
import { Screen } from "./types/Screen.ts";
import * as url from "./url.ts";
import {
  userChanged,
  userInactiveChanged,
  userLeft,
  usersListed,
} from "./users/usersSlice.ts";

/** How long the start game button stays disabled after the player count changes. */
const START_GAME_BUTTON_DISABLED_MILLISECONDS = 500;

let startGameCooldownTimeout: ReturnType<typeof setTimeout> | undefined;

// Define a command handler map.
export const lobbyCommands = new ServerHandlers();

lobbyCommands.set("lobbyStatus", (data) => {
  store.dispatch(lobbyStatusReceived(data));
  if (data.type === "error") {
    modals.showWarning(data.message);
  }
});

lobbyCommands.set("blocked", (data) => {
  globals.blocked = data.blocked;
});

lobbyCommands.set("friends", (data) => {
  // The server has sent us a new list of our friends; store this locally.
  globals.friends = [...data.friends];

  // Since our list of friends has changed, we need to redraw the spectators of the game so that
  // users that happen to be our friend will be shown in the correct color.
  if (globals.currentScreen === Screen.Game && globals.ui !== undefined) {
    spectatorsView.onSpectatorsChanged({
      spectators: globals.ui.globals.state.spectators,
      finished: globals.ui.globals.state.finished,
    });
  }
});

lobbyCommands.set("pregame", (data) => {
  const previousPlayers = globals.game?.players;
  globals.game = data;
  globals.tableId = data.tableId;
  if (previousPlayers?.length !== data.players.length) {
    // Disable the start game button for a short time after the player count changes.
    clearTimeout(startGameCooldownTimeout);
    store.dispatch(startGameCooldownChanged(true));
    startGameCooldownTimeout = setTimeout(() => {
      store.dispatch(startGameCooldownChanged(false));
    }, START_GAME_BUTTON_DISABLED_MILLISECONDS);
  }
});

lobbyCommands.set("gameHistory", (dataArray) => {
  // `dataArray` is a page of the games that we have previously played.
  store.dispatch(historyReceived(dataArray));
});

lobbyCommands.set("gameHistoryAdded", (data) => {
  // We just finished a game, so add it to our history and our total.
  store.dispatch(historyReceived([data]));
  if (globals.totalGames !== undefined) {
    globals.totalGames++;
  }
});

lobbyCommands.set("gameHistoryOtherScores", (data) => {
  store.dispatch(otherScoresReceived(data));
});

lobbyCommands.set("joined", (data) => {
  globals.tableId = data.tableId;

  // We joined a new game, so transition between screens.
  pregame.show();
});

lobbyCommands.set("left", () => {
  // We left a table, so transition between screens. (The server also sends this after we leave a
  // game or replay, by which point we have already returned to the lobby or a history screen.)
  if (globals.currentScreen === Screen.PreGame) {
    pregame.hide();
  }
});

lobbyCommands.set("soundLobby", (data) => {
  sounds.play(toSoundType(data.file));
});

// Received by the client when a table is created or modified.
lobbyCommands.set("table", (data) => {
  store.dispatch(tableChanged(data));
});

// Received by the client when a table no longer has any members present.
lobbyCommands.set("tableGone", (data) => {
  store.dispatch(tableGone(data.tableId));

  // If we were spectating the pre-game of this table, return to the lobby.
  if (
    globals.currentScreen === Screen.PreGame
    && globals.tableId === data.tableId
  ) {
    pregame.hide();
    globals.tableId = NO_TABLE_ID;
  }

  // If we followed a link to this table, it no longer exists, so stay in the lobby.
  if (globals.currentScreen === Screen.Lobby) {
    url.leaveTableLink(data.tableId);
  }
});

// Received by the client upon initial connection.
lobbyCommands.set("tableList", (dataList) => {
  store.dispatch(tablesListed(dataList));
});

lobbyCommands.set("tableStarted", (data) => {
  // Record the table ID for later.
  globals.tableId = data.tableId;

  if (data.stage !== "replay" && globals.currentScreen === Screen.PreGame) {
    pregame.hide(false);
  }
  gameMain.show(data.stage === "justStarted");
});

// Received by the client when a user connects or has a new status.
lobbyCommands.set("user", (data) => {
  globals.userMap.set(data.userId, data);
  store.dispatch(userChanged(data));
});

lobbyCommands.set("userList", (dataList) => {
  for (const data of dataList) {
    globals.userMap.set(data.userId, data);
  }
  store.dispatch(usersListed(dataList));
});

lobbyCommands.set("userLeft", (data) => {
  globals.userMap.delete(data.userId);
  store.dispatch(userLeft(data.userId));
});

lobbyCommands.set("userInactive", (data) => {
  const { userId, inactive } = data;

  const user = globals.userMap.get(userId);
  if (user === undefined) {
    return;
  }

  const newUser = {
    ...user,
    inactive,
  };
  globals.userMap.set(userId, newUser);
  store.dispatch(userInactiveChanged(data));
});

// Received by the client upon first connecting.
lobbyCommands.set("welcome", (data) => {
  // Store some variables (mostly relating to our user account).
  globals.userId = data.userId;
  setTabAccount(data.userId);
  globals.username = data.username; // We might have logged-in with a different stylization
  globals.totalGames = undefined;
  globals.muted = data.muted;
  globals.settings = data.settings;
  globals.friends = data.friends;
  globals.blocked = data.blocked;

  if (theme.takeLegacyDarkMode() && !globals.settings.darkMode) {
    globals.settings = { ...globals.settings, darkMode: true };
    globals.conn!.send("setting", { settings: { darkMode: true } });
  }
  theme.setDarkMode(globals.settings.darkMode);

  // The "lobbyStatus" message reports the total number of games once the statistics load.
  lobbyLogin.hide(data.firstTimeUser);

  // Go to the table that we were at before we disconnected, or somewhere specific if we have
  // entered a specific URL.
  url.parseAndGoto(data);
});
