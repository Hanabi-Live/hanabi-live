// We will receive WebSocket messages / commands from the server that tell us to do things.

import * as gameMain from "../game/main";
import type { Spectator } from "../game/types/Spectator";
import * as spectatorsView from "../game/ui/reactive/view/spectatorsView";
import { globals } from "../Globals";
import * as sounds from "../sounds";
import * as history from "./history";
import * as lobbyLogin from "./login";
import * as playerSettings from "./playerSettings";
import * as pregame from "./pregame";
import { tablesDraw } from "./tablesDraw";
import type { Game } from "./types/Game";
import type { GameHistory } from "./types/GameHistory";
import { Screen } from "./types/Screen";
import type { Table } from "./types/Table";
import type { User } from "./types/User";
import type { WelcomeData } from "./types/WelcomeData";
import * as url from "./url";
import * as usersDraw from "./usersDraw";

// Define a command handler map.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type CommandCallback = (data: any) => void;
export const lobbyCommands = new Map<string, CommandCallback>();

interface FriendsData {
  friends: string[];
}
lobbyCommands.set("friends", (data: FriendsData) => {
  // The server has sent us a new list of our friends; store this locally.
  globals.friends = data.friends;

  // Since our list of friends has changed, we need to redraw some UI elements so that users that
  // happen to be our friend will be shown in the correct color.
  if (
    globals.currentScreen === Screen.Lobby ||
    globals.currentScreen === Screen.PreGame
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

    if (data.incrementNumGames) {
      globals.totalGames++;
    }
  }

  // The server sent us more games because we clicked on the "Show More History" button.
  if (globals.showMoreHistoryClicked) {
    globals.showMoreHistoryClicked = false;
    history.draw(false);
  }

  const shownGames = globals.history.size;
  $("#nav-buttons-history-shown-games").html(shownGames.toString());
  $("#nav-buttons-history-total-games").html(globals.totalGames.toString());
  if (shownGames === globals.totalGames) {
    $("#lobby-history-show-more").hide();
  }
});

lobbyCommands.set("gameHistoryFriends", (dataArray: readonly GameHistory[]) => {
  // `data` will be an array of all of the games that our friends have previously played.
  for (const data of dataArray) {
    globals.historyFriends.set(data.id, data);
  }

  // The server sent us more games because we clicked on the "Show More History" button.
  if (globals.showMoreHistoryClicked) {
    globals.showMoreHistoryClicked = false;
    history.draw(true);
  }
});

interface GameHistoryOtherScoresData {
  games: GameHistory[];
  variantName: string;
  friends: boolean;
  seed: string;
}
lobbyCommands.set(
  "gameHistoryOtherScores",
  (data: GameHistoryOtherScoresData) => {
    history.drawOtherScores(
      data.games,
      data.variantName,
      data.friends,
      data.seed,
    );
  },
);

interface JoinedData {
  tableID: number;
}
lobbyCommands.set("joined", (data: JoinedData) => {
  globals.tableID = data.tableID;

  // We joined a new game, so transition between screens.
  pregame.show();
});

lobbyCommands.set("left", () => {
  // We left a table, so transition between screens.
  pregame.hide();
});

interface MaintenanceData {
  maintenanceMode: boolean;
}
lobbyCommands.set("maintenance", (data: MaintenanceData) => {
  globals.maintenanceMode = data.maintenanceMode;
});

interface NameData {
  name: string;
}
lobbyCommands.set("name", (data: NameData) => {
  globals.randomTableName = data.name;
});

interface ShutdownData {
  shuttingDown: boolean;
  datetimeShutdownInit: string;
}
lobbyCommands.set("shutdown", (data: ShutdownData) => {
  globals.shuttingDown = data.shuttingDown;
  globals.datetimeShutdownInit = new Date(data.datetimeShutdownInit);
});

interface SoundLobbyData {
  file: string;
}
lobbyCommands.set("soundLobby", (data: SoundLobbyData) => {
  sounds.play(data.file);
});

// Received by the client when a table is created or modified.
lobbyCommands.set("table", (data: Table) => {
  globals.tableMap.set(data.id, data);
  if (globals.currentScreen === Screen.Lobby) {
    tablesDraw();
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
});

// Received by the client upon initial connection.
lobbyCommands.set("tableList", (dataList: readonly Table[]) => {
  for (const data of dataList) {
    globals.tableMap.set(data.id, data);
  }
  if (globals.currentScreen === Screen.Lobby) {
    tablesDraw();
  }
});

interface TableProgressData {
  tableID: number;
  progress: number;
}
lobbyCommands.set("tableProgress", (data: TableProgressData) => {
  const table = globals.tableMap.get(data.tableID);
  if (table === undefined) {
    return;
  }
  table.progress = data.progress;

  if (globals.currentScreen === Screen.Lobby) {
    $(`#status-${data.tableID}`).html(data.progress.toString());
  }
});

interface TableStartData {
  tableID: number;
  replay: boolean;
}
lobbyCommands.set("tableStart", (data: TableStartData) => {
  // Record the table ID for later.
  globals.tableID = data.tableID;

  if (!data.replay) {
    pregame.hide();
  }
  gameMain.show();
});

interface SpectatorsData {
  tableID: number;
  spectators: Spectator[];
}
lobbyCommands.set("pregameSpectators", (data: SpectatorsData) => {
  globals.tableID = data.tableID;
  pregame.drawSpectators(globals.tableID);
});

// Received by the client when a user connects or has a new status.
lobbyCommands.set("user", (data: User) => {
  globals.userMap.set(data.userID, data);
  if (
    globals.currentScreen === Screen.Lobby ||
    globals.currentScreen === Screen.PreGame
  ) {
    usersDraw.draw();
  }
});

lobbyCommands.set("userList", (dataList: readonly User[]) => {
  for (const data of dataList) {
    globals.userMap.set(data.userID, data);
  }
  if (
    globals.currentScreen === Screen.Lobby ||
    globals.currentScreen === Screen.PreGame
  ) {
    usersDraw.draw();
  }
});

// Received by the client when a user disconnects.
interface UserLeftData {
  userID: number;
}
lobbyCommands.set("userLeft", (data: UserLeftData) => {
  globals.userMap.delete(data.userID);

  if (
    globals.currentScreen === Screen.Lobby ||
    globals.currentScreen === Screen.PreGame
  ) {
    usersDraw.draw();
  }
});

interface UserInactiveData {
  userID: number;
  inactive: boolean;
}
lobbyCommands.set("userInactive", (data: UserInactiveData) => {
  const user = globals.userMap.get(data.userID);
  if (user === undefined) {
    return;
  }
  user.inactive = data.inactive;
  if (
    globals.currentScreen === Screen.Lobby ||
    globals.currentScreen === Screen.PreGame
  ) {
    usersDraw.setInactive(user.userID, user.inactive);
  }
});

// Received by the client upon first connecting.
lobbyCommands.set("welcome", (data: WelcomeData) => {
  // Store some variables (mostly relating to our user account).
  globals.userID = data.userID;
  globals.username = data.username; // We might have logged-in with a different stylization
  globals.totalGames = data.totalGames;
  globals.muted = data.muted;
  globals.settings = data.settings;
  globals.friends = data.friends;
  globals.randomTableName = data.randomTableName;
  globals.shuttingDown = data.shuttingDown;
  globals.datetimeShutdownInit = new Date(data.datetimeShutdownInit);
  globals.maintenanceMode = data.maintenanceMode;

  // Update various elements of the UI to reflect our settings.
  $("#nav-buttons-history-total-games").html(globals.totalGames.toString());
  playerSettings.setPlayerSettings();
  lobbyLogin.hide(data.firstTimeUser);

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
  if (data.disconSpectatingTable !== 0) {
    globals.conn!.send("tableSpectate", {
      tableID: data.disconSpectatingTable,
      shadowingPlayerIndex: data.disconShadowingSeat,
    });
    return;
  }

  // If we have entered a specific URL, we might want to go somewhere specific instead of the lobby.
  url.parseAndGoto(data);
});
