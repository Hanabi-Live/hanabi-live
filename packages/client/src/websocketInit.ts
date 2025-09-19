// Communication with the server is done through the WebSocket protocol. The client uses a slightly
// modified version of the Golem WebSocket library.

import { commands } from "./commands";
import { Connection } from "./Connection";
import { gameCommands } from "./game/ui/gameCommands";
import { globals } from "./Globals";
import { lobbyCommands } from "./lobby/lobbyCommands";
import { Screen } from "./lobby/types/Screen";
import * as modals from "./modals";

export function websocketInit(): void {
  // Ensure that we are connecting to the right URL.
  const domain = $("#domain").html();
  if (globalThis.location.hostname !== domain) {
    modals.showError(`You are supposed to connect using the URL of: ${domain}`);
    return;
  }

  // Prepare the URL of the WebSocket server
  // e.g. "ws://localhost/ws"
  const websocketProtocol =
    globalThis.location.protocol === "https:" ? "wss" : "ws";
  let websocketHost = globalThis.location.hostname;
  if (globalThis.location.port !== "") {
    websocketHost += `:${globalThis.location.port}`;
  }
  const websocketURL = `${websocketProtocol}://${websocketHost}/ws`;

  // Connect to the WebSocket server. This will automatically use the cookie that we received
  // earlier from the POST. If the second argument is true, debugging is turned on.
  console.log("Connecting to websocket URL:", websocketURL);
  const conn = new Connection(websocketURL, true);

  // Define event handlers
  conn.on("open", () => {
    // We will show the lobby upon receiving the "welcome" command from the server.
    console.log("WebSocket connection established.");
  });
  conn.on("close", () => {
    console.log("WebSocket connection disconnected / closed.");
    modals.showError(
      "Disconnected from the server. Either your Internet hiccuped or the server restarted.",
    );
  });
  conn.on("socketError", (data: unknown) => {
    // "socketError" is defined in the `Connection` object as mapping to the WebSocket "onerror"
    // event.
    console.error("WebSocket error:", data);
  });

  initCommands(conn);
  globals.conn = conn;
}

// We specify a callback for each command/message that we expect to receive from the server.
function initCommands(conn: Connection) {
  // Activate the command handlers for commands relating to both the lobby and the game.
  for (const [commandName, commandFunction] of commands) {
    conn.on(commandName, (data: unknown) => {
      commandFunction(data);
    });
  }

  // Activate the command handlers for lobby-related commands.
  for (const [commandName, commandFunction] of lobbyCommands) {
    conn.on(commandName, (data: unknown) => {
      commandFunction(data);
    });
  }

  // Activate the command handlers for game-related commands.
  for (const [commandName, commandFunction] of gameCommands) {
    conn.on(commandName, (data: unknown) => {
      // As a safety precaution, ignore any game-related commands if we are not inside of a game.
      if (globals.currentScreen !== Screen.Game || globals.ui === null) {
        return;
      }

      // As a safety precaution, ignore any game-related commands if we are still loading the UI.
      // The only commands that we should receive while loading are:
      // 1) "init" (in response to a "getGameInfo1") and
      // 2) "gameActionList" (in response to a "getGameInfo2")
      if (
        globals.ui.globals.loading
        && commandName !== "init"
        && commandName !== "gameActionList"
      ) {
        return;
      }

      commandFunction(data);
    });
  }
}
