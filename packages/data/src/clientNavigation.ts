import { z } from "zod";
import { GAME_CLIENT_COMMAND_SCHEMAS } from "./gameCommands";
import { tableID } from "./types/TableID";

export const NEW_LOBBY_NAVIGATION_KEY = "hanabi-new-lobby-navigation";
export const newLobbyNavigation = z.discriminatedUnion("kind", [
  z.strictObject({
    kind: z.literal("table"),
    tableID,
    shadowingPlayerIndex: z.number().int().min(-1).max(5),
  }),
  z.strictObject({
    kind: z.literal("replay"),
    request: GAME_CLIENT_COMMAND_SCHEMAS.replayCreate,
  }),
]);
export type NewLobbyNavigation = z.infer<typeof newLobbyNavigation>;
