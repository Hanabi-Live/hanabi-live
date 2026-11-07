// We will receive WebSocket messages / commands from the server that tell us to do things.

import type {
  NewLobbyNavigation,
  ServerCommandData,
  ServerCommandTableData,
  ServerCommandUserData,
  ServerCommandUserLeftData,
  ServerCommandUserListData,
  ServerCommandWelcomeData,
  Spectator,
  UserID,
} from "@hanabi-live/data";
import {
  NEW_LOBBY_NAVIGATION_KEY,
  newLobbyNavigation,
} from "@hanabi-live/data";
import { globals } from "../Globals";
import * as gameMain from "../game/main";
import type { SoundType } from "../game/types/SoundType";
import { finishReturningToNewLobby } from "../game/ui/backToLobby";
import * as spectatorsView from "../game/ui/reactive/views/spectatorsView";
import * as modals from "../modals";
import * as sounds from "../sounds";
import * as history from "./history";
import * as lobbyLogin from "./login";
import * as playerSettings from "./playerSettings";
import * as pregame from "./pregame";
import { tablesDraw } from "./tablesDraw";
import type { Game } from "./types/Game";
import type { GameHistory } from "./types/GameHistory";
import { Screen } from "./types/Screen";
import * as url from "./url";
import * as usersDraw from "./usersDraw";

// Define a command handler map.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type CommandCallback = (data: any) => void;
export const lobbyCommands = new Map<string, CommandCallback>();

lobbyCommands.set("lobbyStatus", (data: ServerCommandData["lobbyStatus"]) => {
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

interface FriendsData {
  friends: string[];
}
lobbyCommands.set("friends", (data: FriendsData) => {
  // The server has sent us a new list of our friends; store this locally.
  globals.friends = data.friends;

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

lobbyCommands.set("game", (data: Game) => {
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
    }, 500);
  }

  pregame.drawSpectators(globals.tableID);
});

lobbyCommands.set("gameHistory", (dataArray: readonly GameHistory[]) => {
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

interface GameHistoryOtherScoresData {
  games: GameHistory[];
  variantName: string;
  seed: string;
}
lobbyCommands.set(
  "gameHistoryOtherScores",
  (data: GameHistoryOtherScoresData) => {
    history.drawOtherScores(data.games, data.variantName, data.seed);
  },
);

interface JoinedData {
  tableID: number;
}
lobbyCommands.set("joined", (data: JoinedData) => {
  globals.tableID = data.tableID;

  // We joined a new game, so transition between screens.
  pregame.show();
  pregame.drawSpectators(data.tableID);
});

lobbyCommands.set("left", (data: { tableID: number }) => {
  if (finishReturningToNewLobby(data.tableID)) {
    return;
  }
  // We left a table, so transition between screens.
  pregame.hide();
});

interface SoundLobbyData {
  file: SoundType;
}
lobbyCommands.set("soundLobby", (data: SoundLobbyData) => {
  sounds.play(data.file);
});

// Received by the client when a table is created or modified.
lobbyCommands.set("table", (data: ServerCommandTableData) => {
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
interface TableGoneData {
  tableID: number;
}
lobbyCommands.set("tableGone", (data: TableGoneData) => {
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
    globals.tableID = -1;
  }
});

// Received by the client upon initial connection.
lobbyCommands.set(
  "tableList",
  (dataList: readonly ServerCommandTableData[]) => {
    for (const data of dataList) {
      globals.tableMap.set(data.id, data);
    }
    if (globals.currentScreen === Screen.Lobby) {
      tablesDraw();
    }
  },
);

interface TableStartData {
  tableID: number;
  replay: boolean;
}
lobbyCommands.set("tableStart", (data: TableStartData) => {
  // Record the table ID for later.
  globals.tableID = data.tableID;

  if (!data.replay && globals.currentScreen === Screen.PreGame) {
    pregame.hide(false);
  }
  gameMain.show();
});

interface SpectatorsData {
  tableID: number;
  spectators: Spectator[];
}
lobbyCommands.set("pregameSpectators", (data: SpectatorsData) => {
  if (
    globals.currentScreen === Screen.PreGame
    && globals.tableID === data.tableID
  ) {
    pregame.drawSpectators(data.tableID);
  }
});

// Received by the client when a user connects or has a new status.
lobbyCommands.set("user", (data: ServerCommandUserData) => {
  globals.userMap.set(data.userID, data);
  if (
    globals.currentScreen === Screen.Lobby
    || globals.currentScreen === Screen.PreGame
  ) {
    usersDraw.draw();
  }
});

lobbyCommands.set("userList", (dataList: ServerCommandUserListData) => {
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

lobbyCommands.set("userLeft", (data: ServerCommandUserLeftData) => {
  globals.userMap.delete(data.userID);

  if (
    globals.currentScreen === Screen.Lobby
    || globals.currentScreen === Screen.PreGame
  ) {
    usersDraw.draw();
  }
});

interface UserInactiveData {
  userID: UserID;
  inactive: boolean;
}
lobbyCommands.set("userInactive", (data: UserInactiveData) => {
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
lobbyCommands.set("welcome", (data: ServerCommandWelcomeData) => {
  // Store some variables (mostly relating to our user account).
  globals.userID = data.userID;
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
  let navigation: NewLobbyNavigation | undefined;
  if (
    globalThis.location.pathname === "/game"
    && sessionStorage.getItem("hanabi-lobby") === "new"
  ) {
    const raw = sessionStorage.getItem(NEW_LOBBY_NAVIGATION_KEY);
    if (raw !== null) {
      sessionStorage.removeItem(NEW_LOBBY_NAVIGATION_KEY);
      try {
        navigation = newLobbyNavigation.parse(JSON.parse(raw));
      } catch (error) {
        console.error("Invalid lobby navigation", error);
        modals.showError(
          "The game request could not be restored. Return to the new lobby and try again.",
        );
        return;
      }
    }
  }
  lobbyLogin.hide(data.firstTimeUser && navigation === undefined);
  if (navigation !== undefined) {
    if (navigation.kind === "replay") {
      globals.conn!.send("replayCreate", navigation.request);
    } else if (data.playingAtTables.includes(navigation.tableID)) {
      globals.conn!.send("tableReattend", { tableID: navigation.tableID });
    } else {
      globals.conn!.send("tableSpectate", {
        tableID: navigation.tableID,
        shadowingPlayerIndex: navigation.shadowingPlayerIndex,
      });
    }
    return;
  }

  // If the server has informed us that we are currently playing in an ongoing game, automatically
  // reconnect to that game (and ignore any specific custom path that the user has entered).
  if (data.playingAtTables.length > 0) {
    const firstTableID = data.playingAtTables[0];
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
