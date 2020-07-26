// Communication with the server is done through the WebSocket protocol
// The client uses a slightly modified version of the Golem WebSocket library

import commands from './commands';
import Connection from './Connection';
import gameCommands from './game/ui/gameCommands';
import globals from './globals';
import lobbyCommands from './lobby/lobbyCommands';
import Screen from './lobby/types/Screen';
import * as modals from './modals';

export default function websocketInit() {
  // Ensure that we are connecting to the right URL
  const domain = $('#domain').html();
  if (window.location.hostname !== domain) {
    modals.errorShow(`You are supposed to connect using the URL of: ${domain}`);
    return;
  }

  // Prepare the URL of the WebSocket server
  let websocketURL = 'ws';
  if (window.location.protocol === 'https:') {
    websocketURL += 's';
  }
  websocketURL += '://';
  websocketURL += window.location.hostname;
  if (window.location.port !== '') {
    websocketURL += ':';
    websocketURL += window.location.port;
  }
  websocketURL += '/ws';

  // Connect to the WebSocket server
  // This will automatically use the cookie that we received earlier from the POST
  // If the second argument is true, debugging is turned on
  console.log('Connecting to websocket URL:', websocketURL);
  const conn = new Connection(websocketURL, true);

  // Define event handlers
  conn.on('open', () => {
    // We will show the lobby upon receiving the "welcome" command from the server
    console.log('WebSocket connection established.');
  });
  conn.on('close', () => {
    console.log('WebSocket connection disconnected / closed.');
    modals.errorShow('Disconnected from the server. Either your Internet hiccuped or the server restarted.');
  });
  conn.on('socketError', (event: Event) => {
    // "socketError" is defined in the Connection object as mapping to
    // the WebSocket "onerror" event
    console.error('WebSocket error:', event);
  });

  initCommands(conn);
  globals.conn = conn;
}

// We specify a callback for each command/message that we expect to receive from the server
const initCommands = (conn: Connection) => {
  // Activate the command handlers for commands relating to both the lobby and the game
  for (const [commandName, commandFunction] of commands) {
    conn.on(commandName, (data: any) => {
      commandFunction(data);
    });
  }

  // Activate the command handlers for lobby-related commands
  for (const [commandName, commandFunction] of lobbyCommands) {
    conn.on(commandName, (data: any) => {
      commandFunction(data);
    });
  }

  // Activate the command handlers for game-related commands
  for (const [commandName, commandFunction] of gameCommands) {
    conn.on(commandName, (data: any) => {
      // As a safety precaution, ignore any game-related commands if we are not inside of a game
      if (globals.currentScreen !== Screen.Game || globals.ui === null) {
        return;
      }

      // As a safety precaution, ignore any game-related commands if we are still loading the UI
      // The only commands that we should receive while loading are:
      // 1) "init" (in response to a "getGameInfo1") and
      // 2) "gameActionList" (in response to a "getGameInfo2")
      if (
        globals.ui.globals.loading
        && commandName !== 'init'
        && commandName !== 'gameActionList'
      ) {
        return;
      }

      commandFunction(data);
    });
  }
};
