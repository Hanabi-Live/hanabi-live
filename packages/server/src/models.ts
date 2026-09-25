/* eslint-disable @typescript-eslint/no-restricted-imports */
// This file is the only place that is allowed to import from the models directory.

import { bannedIPs } from "./models/bannedIPs";
import { chatLog } from "./models/chatLog";
import { chatLogPM } from "./models/chatLogPM";
import { games } from "./models/games";
import { gameTags } from "./models/gameTags";
import { userFriends } from "./models/userFriends";
import { userIdentityTokens } from "./models/userIdentityTokens";
import { users } from "./models/users";
import { userSettings } from "./models/userSettings";

export const models = {
  bannedIPs,
  chatLog,
  chatLogPM,
  games,
  gameTags,
  users,
  userFriends,
  userIdentityTokens,
  userSettings,
};
