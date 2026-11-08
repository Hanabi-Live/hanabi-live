// We will receive WebSocket messages / commands from the server that tell us to do things.

import { setTabAccount } from "@hanabi-live/data";
import { globals } from "../Globals";
import { NO_TABLE_ID } from "../constants";
import * as gameMain from "../game/main";
import * as spectatorsView from "../game/ui/reactive/views/spectatorsView";
import * as modals from "../modals";
import { ServerHandlers } from "../serverHandlers";
import * as sounds from "../sounds";
import { toSoundType } from "../wire";
import * as history from "./history";
import * as lobbyLogin from "./login";
import * as playerSettings from "./playerSettings";
import * as pregame from "./pregame";
import { tablesDraw } from "./tablesDraw";
import { Screen } from "./types/Screen";
import * as url from "./url";
import * as usersDraw from "./usersDraw";

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
  if (
    globals.currentScreen === Screen.Lobby
    || globals.currentScreen === Screen.PreGame
  ) {
    usersDraw.draw();
  }
  if (globals.currentScreen === Screen.Lobby) {
    tablesDraw();
  }
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
    globals.history.set(data.id, data);

    if (data.incrementNumGames && globals.totalGames !== null) {
      globals.totalGames++;
    }
  }

  // Only redraw the screen that requested this page; late responses must not switch views.
  if (globals.currentScreen === Screen.History) {
    history.draw();
  }

  const shownGames = globals.history.size;
  $("#nav-buttons-history-shown-games").html(shownGames.toString());
  $("#nav-buttons-history-total-games").text(
    globals.totalGames?.toString() ?? "loading...",
  );
  if (
    globals.currentScreen === Screen.History
    && shownGames === globals.totalGames
  ) {
    $("#lobby-history-show-more").hide();
  }
});

lobbyCommands.set("gameHistoryOtherScores", (data) => {
  history.drawOtherScores(data.games, data.variantName, data.seed);
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
  globals.tableMap.set(data.id, data);
  if (globals.currentScreen === Screen.Lobby) {
    tablesDraw();
  } else if (
    globals.currentScreen === Screen.PreGame
    && globals.tableID === data.id
  ) {
    pregame.drawSpectators(data.id);
  }
});

// Received by the client when a table no longer has any members present.
lobbyCommands.set("tableGone", (data) => {
  globals.tableMap.delete(data.tableID);

  if (globals.currentScreen === Screen.Lobby) {
    tablesDraw();
  }

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
  for (const data of dataList) {
    globals.tableMap.set(data.id, data);
  }
  if (globals.currentScreen === Screen.Lobby) {
    tablesDraw();
  }
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
  if (
    globals.currentScreen === Screen.Lobby
    || globals.currentScreen === Screen.PreGame
  ) {
    usersDraw.draw();
  }
});

lobbyCommands.set("userList", (dataList) => {
  for (const data of dataList) {
    globals.userMap.set(data.userID, data);
  }
  if (
    globals.currentScreen === Screen.Lobby
    || globals.currentScreen === Screen.PreGame
  ) {
    usersDraw.draw();
  }
});

lobbyCommands.set("userLeft", (data) => {
  globals.userMap.delete(data.userID);

  if (
    globals.currentScreen === Screen.Lobby
    || globals.currentScreen === Screen.PreGame
  ) {
    usersDraw.draw();
  }
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

  if (
    globals.currentScreen === Screen.Lobby
    || globals.currentScreen === Screen.PreGame
  ) {
    usersDraw.setInactive(user.userID, user.inactive);
  }
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

  // Update various elements of the UI to reflect our settings.
  $("#nav-buttons-history-total-games").text(
    globals.totalGames?.toString() ?? "loading...",
  );
  playerSettings.setPlayerSettings();
  lobbyLogin.hide(data.firstTimeUser);

  // If the server has informed us that we are currently playing in an ongoing game, automatically
  // reconnect to that game (and ignore any specific custom path that the user has entered).
  const firstTableID = data.playingAtTables[0];
  if (firstTableID !== undefined) {
    globals.conn!.send("tableReattend", {
      tableID: firstTableID,
    });
    return;
  }

  // If the server has informed us that were previously spectating an ongoing shared replay,
  // automatically spectate that table (and ignore any specific custom path that the user has
  // entered).
  if (
    data.disconSpectatingTable !== undefined
    && data.disconSpectatingTable > 0
  ) {
    globals.conn!.send("tableSpectate", {
      tableID: data.disconSpectatingTable,
      shadowingPlayerIndex: data.disconShadowingSeat,
    });
    return;
  }

  // If we have entered a specific URL, we might want to go somewhere specific instead of the lobby.
  url.parseAndGoto(data);
});
