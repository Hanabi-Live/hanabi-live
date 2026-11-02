import type { ServerCommandData, UserID } from "@hanabi-live/data";

export interface TablePlayer {
  userID: UserID;
  name: string;
  present: boolean;
  stats: ServerCommandData["game"]["players"][number]["stats"];
  typing: boolean;
  lastTyped: Date;
  voteToKill: boolean;
}
