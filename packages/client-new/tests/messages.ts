import { defaultSettings, SERVER_COMMAND_SCHEMAS } from "@hanabi-live/data";
import type { Welcome } from "../src/protocol";

export function welcome(userID = 1): Welcome {
  return SERVER_COMMAND_SCHEMAS.welcome.parse({
    userID,
    username: userID === 1 ? "Alice" : "Bob",
    totalGames: 0,
    muted: false,
    firstTimeUser: false,
    settings: defaultSettings,
    friends: [],
    playingAtTables: [],
    shuttingDown: false,
    maintenanceMode: false,
  });
}
