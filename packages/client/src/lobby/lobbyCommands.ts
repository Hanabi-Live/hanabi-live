// We will receive WebSocket messages / commands from the server that tell us to do things.

import { setTabAccount } from "@hanabi-live/data";
import { globals } from "../Globals";
import { NO_TABLE_ID } from "../constants";
import * as gameMain from "../game/main";
import * as spectatorsView from "../game/ui/reactive/views/spectatorsView";
import * as modals from "../modals";
import { ServerHandlers } from "../serverHandlers";
import * as sounds from "../sounds";
import { store } from "../store";
import * as theme from "../theme";
import { toSoundType } from "../wire";
import {
  historyReceived,
  lobbyStatusReceived,
  otherScoresReceived,
} from "./gameHistory/historySlice";
import * as lobbyLogin from "./login";
import * as playerSettings from "./playerSettings";
import * as pregame from "./pregame/pregame";
import { startGameCooldownChanged } from "./pregame/pregameSlice";
import { tableChanged, tableGone, tablesListed } from "./tables/tablesSlice";
import { Screen } from "./types/Screen";
import * as url from "./url";
import {
  userChanged,
  userInactiveChanged,
  userLeft,
  usersListed,
} from "./users/usersSlice";

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
  globals.tableID = data.tableID;
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
  globals.tableID = data.tableID;

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
  store.dispatch(tableGone(data.tableID));

  // If we were spectating the pre-game of this table, return to the lobby.
  if (
    globals.currentScreen === Screen.PreGame
    && globals.tableID === data.tableID
  ) {
    pregame.hide();
    globals.tableID = NO_TABLE_ID;
  }

  // If we followed a link to this table, it no longer exists, so stay in the lobby.
  if (globals.currentScreen === Screen.Lobby) {
    url.leaveTableLink(data.tableID);
  }
});

// Received by the client upon initial connection.
lobbyCommands.set("tableList", (dataList) => {
  store.dispatch(tablesListed(dataList));
});

lobbyCommands.set("tableStarted", (data) => {
  // Record the table ID for later.
  globals.tableID = data.tableID;

  if (data.stage !== "replay" && globals.currentScreen === Screen.PreGame) {
    pregame.hide(false);
  }
  gameMain.show(data.stage === "justStarted");
});

// Received by the client when a user connects or has a new status.
lobbyCommands.set("user", (data) => {
  globals.userMap.set(data.userID, data);
  store.dispatch(userChanged(data));
});

lobbyCommands.set("userList", (dataList) => {
  for (const data of dataList) {
    globals.userMap.set(data.userID, data);
  }
  store.dispatch(usersListed(dataList));
});

lobbyCommands.set("userLeft", (data) => {
  globals.userMap.delete(data.userID);
  store.dispatch(userLeft(data.userID));
});

lobbyCommands.set("userInactive", (data) => {
  const { userID, inactive } = data;

  const user = globals.userMap.get(userID);
  if (user === undefined) {
    return;
  }

  const newUser = {
    ...user,
    inactive,
  };
  globals.userMap.set(userID, newUser);
  store.dispatch(userInactiveChanged(data));
});

// Received by the client upon first connecting.
lobbyCommands.set("welcome", (data) => {
  // Store some variables (mostly relating to our user account).
  globals.userID = data.userID;
  setTabAccount(data.userID);
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

  // Update various elements of the UI to reflect our settings. The "lobbyStatus" message reports
  // the total number of games once the statistics load.
  playerSettings.setPlayerSettings();
  lobbyLogin.hide(data.firstTimeUser);

  // Go to the table that we were at before we disconnected, or somewhere specific if we have
  // entered a specific URL.
  url.parseAndGoto(data);
});
