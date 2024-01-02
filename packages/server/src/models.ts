/* eslint-disable @typescript-eslint/no-restricted-imports */

import { bannedIPs } from "./models/bannedIPs";
import { chatLog } from "./models/chatLog";
import { chatLogPM } from "./models/chatLogPM";
import { games } from "./models/games";
import { userFriends } from "./models/userFriends";
import { userSettings } from "./models/userSettings";
import { users } from "./models/users";

export const models = {
  bannedIPs,
  chatLog,
  chatLogPM,
  games,
  users,
  userFriends,
  userSettings,
};
