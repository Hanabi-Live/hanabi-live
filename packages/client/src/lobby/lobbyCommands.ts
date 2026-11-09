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
  otherScoresReceived,
} from "./gameHistory/historySlice";
import * as lobbyLogin from "./login";
import * as playerSettings from "./playerSettings";
import * as pregame from "./pregame";
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

// Define a command handler map.
export const lobbyCommands = new ServerHandlers();

lobbyCommands.set("lobbyStatus", (data) => {
  const total = $("#nav-buttons-history-total-games");
  total.off("click.lobbyRetry").removeAttr("title");
  if (data.state === "ready") {
    globals.totalGames = data.totalGames;
    $("#nav-buttons-history-total-games").text(data.totalGames.toString());
  } else {
    $("#nav-buttons-history-total-games").text(
      data.state === "error" ? "unavailable" : "loading...",
    );
    if (data.state === "error") {
      total
        .text("unavailable (click to retry)")
        .attr(
          "title",
          data.message
            ?? "Loading lobby statistics failed without a server explanation.",
        )
        .on("click.lobbyRetry", () => {
          globals.conn?.send("lobbyLoad", {});
        });
      modals.showWarning(
        data.message
          ?? "Loading lobby statistics failed without a server explanation. Click the statistics total to retry.",
      );
    }
  }
});

lobbyCommands.set("friends", (data) => {
  // The server has sent us a new list of our friends; store this locally.
  globals.friends = [...data.friends];

  // Since our list of friends has changed, we need to redraw some UI elements so that users that
  // happen to be our friend will be shown in the correct color.
  if (globals.currentScreen === Screen.PreGame) {
    pregame.draw();
  }
  if (globals.currentScreen === Screen.Game && globals.ui !== null) {
    spectatorsView.onSpectatorsChanged({
      spectators: globals.ui.globals.state.spectators,
      finished: globals.ui.globals.state.finished,
    });
  }
});

lobbyCommands.set("game", (data) => {
  const previousPlayers = globals.game?.players;
  globals.game = data;
  globals.tableID = data.tableID;
  pregame.draw();
  if (previousPlayers?.length !== data.players.length) {
    // Disable the start game button for a short time after the player count changes.
    if (globals.enableStartGameButtonTimeout !== null) {
      clearTimeout(globals.enableStartGameButtonTimeout);
    }
    $("#nav-buttons-pregame-start").addClass("disabled");
    globals.enableStartGameButtonTimeout = setTimeout(() => {
      globals.enableStartGameButtonTimeout = null;
      pregame.toggleStartGameButton();
    }, START_GAME_BUTTON_DISABLED_MILLISECONDS);
  }

  pregame.drawSpectators(globals.tableID);
});

lobbyCommands.set("gameHistory", (dataArray) => {
  // `data` will be an array of all of the games that we have previously played.
  for (const data of dataArray) {
    if (data.incrementNumGames && globals.totalGames !== null) {
      globals.totalGames++;
    }
  }
  store.dispatch(historyReceived(dataArray));

  $("#nav-buttons-history-total-games").text(
    globals.totalGames?.toString() ?? "loading...",
  );
});

lobbyCommands.set("gameHistoryOtherScores", (data) => {
  store.dispatch(otherScoresReceived(data));
});

lobbyCommands.set("joined", (data) => {
  globals.tableID = data.tableID;

  // We joined a new game, so transition between screens.
  pregame.show();
  pregame.drawSpectators(data.tableID);
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
  if (globals.currentScreen === Screen.PreGame && globals.tableID === data.id) {
    pregame.drawSpectators(data.id);
  }
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
});

// Received by the client upon initial connection.
lobbyCommands.set("tableList", (dataList) => {
  store.dispatch(tablesListed(dataList));
});

lobbyCommands.set("tableStart", (data) => {
  // Record the table ID for later.
  globals.tableID = data.tableID;

  if (!data.replay && globals.currentScreen === Screen.PreGame) {
    pregame.hide(false);
  }
  gameMain.show();
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
  globals.totalGames = data.totalGames;
  globals.muted = data.muted;
  globals.settings = data.settings;
  globals.friends = data.friends;

  if (theme.takeLegacyDarkMode() && !globals.settings.darkMode) {
    globals.settings = { ...globals.settings, darkMode: true };
    globals.conn!.send("setting", {
      name: "darkMode",
      setting: "true", // The server expects all setting values as strings.
    });
  }
  theme.setDarkMode(globals.settings.darkMode);

  // Update various elements of the UI to reflect our settings.
  $("#nav-buttons-history-total-games").text(
    globals.totalGames?.toString() ?? "loading...",
  );
  playerSettings.setPlayerSettings();
  lobbyLogin.hide(data.firstTimeUser);

  // Go to the table that we were at before we disconnected, or somewhere specific if we have
  // entered a specific URL.
  url.parseAndGoto(data);
});
