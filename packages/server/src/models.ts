/* eslint-disable @typescript-eslint/no-restricted-imports */
// This file is the only place that is allowed to import from the models directory.

import { bannedIPs } from "./models/bannedIPs";
import { chatLog } from "./models/chatLog";
import { chatLogPM } from "./models/chatLogPM";
import { gameQueries } from "./models/gameQueries";
import { games } from "./models/games";
import { gameTags } from "./models/gameTags";
import { publicStats } from "./models/publicStats";
import { replays } from "./models/replays";
import { userFriends } from "./models/userFriends";
import { userIdentityTokens } from "./models/userIdentityTokens";
import { userLinkages } from "./models/userLinkages";
import { users } from "./models/users";
import { userSettings } from "./models/userSettings";
import { userStats } from "./models/userStats";

export const models = {
  bannedIPs,
  chatLog,
  chatLogPM,
  games,
  gameTags,
  gameQueries,
  publicStats,
  replays,
  users,
  userFriends,
  userIdentityTokens,
  userLinkages,
  userSettings,
  userStats,
};
