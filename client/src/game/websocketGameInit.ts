// WebSocket command handlers for in-game events

import globals from '../globals';
import websocket from './ui/websocket';

export default function websocketGameInit() {
  if (globals.conn === null) {
    throw new Error('The "initCommands()" function was entered before "globals.conn" was initiated.');
  }

  // WebSocket command handlers for the game are defined in "client/src/game/ui/websocket.ts"
  // As a safety precaution, ignore any game-related commands if the current screen is not on the
  // game
  for (const [commandName, commandFunction] of websocket) {
    globals.conn.on(commandName, (data: any) => {
      if (globals.currentScreen !== 'game') {
        return;
      }

      commandFunction(data);
    });
  }
}
