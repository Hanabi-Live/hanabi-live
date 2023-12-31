/* eslint-disable @typescript-eslint/no-restricted-imports */

import { bannedIPs } from "./models/bannedIPs";
import { chatLog } from "./models/chatLog";
import { chatLogPM } from "./models/chatLogPM";
import { users } from "./models/users";

export const models = {
  bannedIPs,
  chatLog,
  chatLogPM,
  users,
};
