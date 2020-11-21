// We will receive WebSocket messages / commands from the server that tell us to do things

import * as gameMain from "../game/main";
import { DEFAULT_VARIANT_NAME } from "../game/types/constants";
import * as spectatorsView from "../game/ui/reactive/view/spectatorsView";
import globals from "../globals";
import { parseIntSafe, setBrowserAddressBarPath } from "../misc";
import * as sentry from "../sentry";
import * as sounds from "../sounds";
import * as history from "./history";
import * as lobbyLogin from "./login";
import * as pregame from "./pregame";
import * as lobbySettingsTooltip from "./settingsTooltip";
import tablesDraw from "./tablesDraw";
import Game from "./types/Game";
import GameHistory from "./types/GameHistory";
import Screen from "./types/Screen";
import Settings from "./types/Settings";
import Table from "./types/Table";
import User from "./types/User";
import * as usersDraw from "./usersDraw";

// Define a command handler map
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type CommandCallback = (data: any) => void;
const commands = new Map<string, CommandCallback>();
export default commands;

interface FriendsData {
  friends: string[];
}
commands.set("friends", (data: FriendsData) => {
  // The server has sent us a new list of our friends; store this locally
  globals.friends = data.friends;

  // Since our list of friends has changed, we need to redraw some UI elements so that users that
  // happen to be our friend will be shown in the correct color
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

commands.set("game", (data: Game) => {
  globals.game = data;
  pregame.draw();
});

commands.set("gameHistory", (dataArray: GameHistory[]) => {
  // data will be an array of all of the games that we have previously played
  for (const data of dataArray) {
    globals.history[data.id] = data;

    if (data.incrementNumGames) {
      globals.totalGames += 1;
    }
  }

  // The server sent us more games because
  // we clicked on the "Show More History" button
  if (globals.showMoreHistoryClicked) {
    globals.showMoreHistoryClicked = false;
    history.draw(false);
  }

  const shownGames = Object.keys(globals.history).length;
  $("#nav-buttons-history-shown-games").html(shownGames.toString());
  $("#nav-buttons-history-total-games").html(globals.totalGames.toString());
  if (shownGames === globals.totalGames) {
    $("#lobby-history-show-more").hide();
  }
});

commands.set("gameHistoryFriends", (dataArray: GameHistory[]) => {
  // data will be an array of all of the games that our friends have previously played
  for (const data of dataArray) {
    globals.historyFriends[data.id] = data;
  }

  // The server sent us more games because
  // we clicked on the "Show More History" button
  if (globals.showMoreHistoryClicked) {
    globals.showMoreHistoryClicked = false;
    history.draw(true);
  }
});

interface GameHistoryOtherScoresData {
  games: GameHistory[];
  friends: boolean;
}
commands.set("gameHistoryOtherScores", (data: GameHistoryOtherScoresData) => {
  history.drawOtherScores(data.games, data.friends);
});

interface JoinedData {
  tableID: number;
}
commands.set("joined", (data: JoinedData) => {
  globals.tableID = data.tableID;

  // We joined a new game, so transition between screens
  pregame.show();
});

commands.set("left", () => {
  // We left a table, so transition between screens
  pregame.hide();
});

interface MaintenanceData {
  maintenanceMode: boolean;
}
commands.set("maintenance", (data: MaintenanceData) => {
  globals.maintenanceMode = data.maintenanceMode;
});

interface NameData {
  name: string;
}
commands.set("name", (data: NameData) => {
  globals.randomTableName = data.name;
});

interface ShutdownData {
  shuttingDown: boolean;
  datetimeShutdownInit: number;
}
commands.set("shutdown", (data: ShutdownData) => {
  globals.shuttingDown = data.shuttingDown;
  globals.datetimeShutdownInit = data.datetimeShutdownInit;
});

interface SoundLobbyData {
  file: string;
}
commands.set("soundLobby", (data: SoundLobbyData) => {
  sounds.play(data.file);
});

// Received by the client when a table is created or modified
commands.set("table", (data: Table) => {
  globals.tableMap.set(data.id, data);
  if (globals.currentScreen === Screen.Lobby) {
    tablesDraw();
  }
});

// Received by the client when a table no longer has any members present
interface TableGoneData {
  tableID: number;
}
commands.set("tableGone", (data: TableGoneData) => {
  globals.tableMap.delete(data.tableID);

  if (globals.currentScreen === Screen.Lobby) {
    tablesDraw();
  }
});

// Received by the client upon initial connection
commands.set("tableList", (dataList: Table[]) => {
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
commands.set("tableProgress", (data: TableProgressData) => {
  const table = globals.tableMap.get(data.tableID);
  if (!table) {
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
commands.set("tableStart", (data: TableStartData) => {
  // Record the table ID for later
  globals.tableID = data.tableID;

  if (!data.replay) {
    pregame.hide();
  }
  gameMain.show();
});

// Received by the client when a user connects or has a new status
commands.set("user", (data: User) => {
  globals.userMap.set(data.userID, data);
  if (
    globals.currentScreen === Screen.Lobby ||
    globals.currentScreen === Screen.PreGame
  ) {
    usersDraw.draw();
  }
});

commands.set("userList", (dataList: User[]) => {
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

// Received by the client when a user disconnects
interface UserLeftData {
  userID: number;
}
commands.set("userLeft", (data: UserLeftData) => {
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
commands.set("userInactive", (data: UserInactiveData) => {
  const user = globals.userMap.get(data.userID);
  if (user) {
    user.inactive = data.inactive;
    if (
      globals.currentScreen === Screen.Lobby ||
      globals.currentScreen === Screen.PreGame
    ) {
      usersDraw.setInactive(user.userID, user.inactive);
    }
  }
});

// Received by the client upon first connecting
interface WelcomeData {
  userID: number;
  username: string;
  totalGames: number;
  muted: boolean;
  firstTimeUser: boolean;
  settings: Settings;
  friends: string[];
  playingInOngoingGameTableID: number;
  spectatingTableID: number;
  randomTableName: string;
  shuttingDown: boolean;
  maintenanceMode: boolean;
}
commands.set("welcome", (data: WelcomeData) => {
  // Store some variables (mostly relating to our user account)
  globals.userID = data.userID;
  globals.username = data.username; // We might have logged-in with a different stylization
  globals.totalGames = data.totalGames;
  globals.muted = data.muted;
  globals.settings = data.settings;
  globals.friends = data.friends;
  globals.randomTableName = data.randomTableName;
  globals.shuttingDown = data.shuttingDown;
  globals.maintenanceMode = data.maintenanceMode;

  // Now that we know what our user ID and username are, we can attach them to the Sentry context
  sentry.setUserContext(globals.userID, globals.username);

  // Update various elements of the UI to reflect our settings
  $("#nav-buttons-history-total-games").html(globals.totalGames.toString());
  lobbySettingsTooltip.setSettingsTooltip();
  lobbyLogin.hide(data.firstTimeUser);

  // Disable custom path functionality for first time users
  if (data.firstTimeUser) {
    return;
  }

  // Automatically join a table if we are using a "/pre-game/123" URL
  const preGameMatch = /\/pre-game\/(\d+)/.exec(window.location.pathname);
  if (preGameMatch) {
    const tableID = parseIntSafe(preGameMatch[1]); // The server expects the game ID as an integer
    globals.conn!.send("tableJoin", {
      tableID,
    });
    return;
  }

  // Automatically go into a replay if we are using a "/replay/123" URL
  const replayMatch = /\/replay\/(\d+)/.exec(window.location.pathname);
  if (replayMatch) {
    const gameID = parseIntSafe(replayMatch[1]); // The server expects the game ID as an integer
    globals.conn!.send("replayCreate", {
      gameID,
      source: "id",
      visibility: "solo",
      shadowingPlayerIndex: -1,
    });
    return;
  }

  // Automatically go into a shared replay if we are using a "/shared-replay/123" URL
  const sharedReplayMatch = /\/shared-replay\/(\d+)/.exec(
    window.location.pathname,
  );
  if (sharedReplayMatch) {
    const gameID = parseIntSafe(sharedReplayMatch[1]); // The server expects the game ID as an integer
    globals.conn!.send("replayCreate", {
      gameID,
      source: "id",
      visibility: "shared",
      shadowingPlayerIndex: -1,
    });
    return;
  }

  // Automatically create a table if we are using a "/create-table" URL
  if (window.location.pathname === "/create-table") {
    const urlParams = new URLSearchParams(window.location.search);
    const name = urlParams.get("name") ?? globals.randomTableName;
    const variantName = urlParams.get("variantName") ?? DEFAULT_VARIANT_NAME;
    const timed = urlParams.get("timed") === "true";
    const timeBaseString = urlParams.get("timeBase") ?? "120";
    const timeBase = parseIntSafe(timeBaseString);
    const timePerTurnString = urlParams.get("timePerTurn") ?? "20";
    const timePerTurn = parseIntSafe(timePerTurnString);
    const speedrun = urlParams.get("speedrun") === "true";
    const cardCycle = urlParams.get("cardCycle") === "true";
    const deckPlays = urlParams.get("deckPlays") === "true";
    const emptyClues = urlParams.get("emptyClues") === "true";
    const oneExtraCard = urlParams.get("oneExtraCard") === "true";
    const oneLessCard = urlParams.get("oneLessCard") === "true";
    const allOrNothing = urlParams.get("allOrNothing") === "true";
    const detrimentalCharacters =
      urlParams.get("detrimentalCharacters") === "true";
    const password = urlParams.get("password") ?? "";

    globals.conn!.send("tableCreate", {
      name,
      options: {
        variantName,
        timed,
        timeBase,
        timePerTurn,
        speedrun,
        cardCycle,
        deckPlays,
        emptyClues,
        oneExtraCard,
        oneLessCard,
        allOrNothing,
        detrimentalCharacters,
      },
      password,
    });
    return;
  }

  // If the server has informed us that we are currently playing in an ongoing game,
  // automatically reconnect to that game
  if (data.playingInOngoingGameTableID !== 0) {
    globals.conn!.send("tableReattend", {
      tableID: data.playingInOngoingGameTableID,
    });
    return;
  }

  // If the server has informed us that were previously spectating an ongoing shared replay,
  // automatically spectate that table
  if (data.spectatingTableID !== 0) {
    globals.conn!.send("tableSpectate", {
      tableID: data.spectatingTableID,
      shadowingPlayerIndex: -1,
    });
    return;
  }

  // Otherwise, we will stay in the lobby
  setBrowserAddressBarPath("/lobby");
});
