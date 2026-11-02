import type { ServerCommandChatData, TableID, UserID } from "@hanabi-live/data";
import type { NumPlayers, Options } from "@hanabi-live/game";
import type { z } from "zod";
import type { extraOptions } from "./ExtraOptions";
import type { Game } from "./Game";
import type { ServerSpectator } from "./ServerSpectator";
import type { TablePlayer } from "./TablePlayer";

/** Mutable state owned by the registry and its per-table execution queue. */
export interface Table {
  id: TableID;
  name: string;
  initialName: string;
  players: TablePlayer[];
  maxPlayers: NumPlayers;
  spectators: ServerSpectator[];
  kickedPlayers: UserID[];
  ownerID: UserID;
  visible: boolean;
  passwordHash: string | undefined;
  running: boolean;
  replay: boolean;
  progress: number;
  datetimeCreated: Date;
  datetimeLastJoined: Date;
  datetimePlannedStart: Date | undefined;
  datetimeLastAction: Date;
  game: Game | undefined;
  recoveryBlocked?: boolean;
  options: Options;
  extraOptions: z.infer<typeof extraOptions>;
  chat: Array<{ userID: number; message: ServerCommandChatData }>;
  chatRead: Map<UserID, number>;
}
