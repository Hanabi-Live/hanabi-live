import type { ServerCommandData } from "@hanabi-live/data";
import {
  SERVER_COMMAND_SCHEMAS,
  ServerCommand,
  gameHistory,
  spectator,
  unpackWSMessage,
} from "@hanabi-live/data";
import { options } from "@hanabi-live/game";
import { z } from "zod";

export const wireHistory = gameHistory.unwrap().extend({
  datetimeStarted: z
    .string()
    .refine(
      (value) => Number.isFinite(Date.parse(value)),
      "Invalid history date",
    ),
  datetimeFinished: z
    .string()
    .refine(
      (value) => Number.isFinite(Date.parse(value)),
      "Invalid history date",
    ),
});
export type HistoryGame = z.infer<typeof wireHistory>;
// Pregames report the actual roster size (including zero/one), not a started-game size.
const lobbyOptions = options
  .unwrap()
  .extend({ numPlayers: z.number().int().min(0).max(6) });
// The server uses an empty name for a spectator without a shadow.
const wireSpectator = spectator.unwrap().extend({
  shadowingPlayerUsername: z.preprocess(
    (value) => (value === "" ? undefined : value),
    z.string().min(1).optional(),
  ),
});
const tableSchema = SERVER_COMMAND_SCHEMAS.table.unwrap().extend({
  options: lobbyOptions,
  spectators: wireSpectator.array().readonly(),
});
const spectatorsSchema = SERVER_COMMAND_SCHEMAS.spectators.extend({
  spectators: wireSpectator.array(),
});
const pregameSchema = SERVER_COMMAND_SCHEMAS.game.extend({
  options: lobbyOptions,
});
export type Pregame = z.infer<typeof pregameSchema>;
export type Welcome = ServerCommandData[ServerCommand.welcome];
export type Table = z.infer<typeof tableSchema>;
export type User = ServerCommandData[ServerCommand.user];
export type Chat = ServerCommandData[ServerCommand.chat];

type WirePayloads = Omit<
  ServerCommandData,
  "gameHistory" | "gameHistoryOtherScores" | "table" | "tableList" | "game"
> & {
  table: Table;
  tableList: Table[];
  game: Pregame;
  gameHistory: HistoryGame[];
  gameHistoryOtherScores: {
    games: HistoryGame[];
    variantName: string;
    seed: string;
  };
};
export type ServerEvent = {
  [K in keyof WirePayloads]: { command: `${K}`; data: WirePayloads[K] };
}[keyof WirePayloads];

const otherScores = z.object({
  games: wireHistory.array(),
  variantName: z.string(),
  seed: z.string(),
});

function isServerCommand(command: string): command is ServerCommand {
  return Object.hasOwn(SERVER_COMMAND_SCHEMAS, command);
}

export function decodeEvent(text: string): ServerEvent | undefined {
  const unpacked = unpackWSMessage(text);
  if (!unpacked) {
    throw new Error("The server sent an invalid message.");
  }
  const [command, data] = unpacked;
  if (command === "table") {
    return { command, data: tableSchema.parse(data) };
  }
  if (command === "tableList") {
    return { command, data: tableSchema.array().parse(data) };
  }
  if (command === "game") {
    return { command, data: pregameSchema.parse(data) };
  }
  if (command === "gameHistory") {
    return { command, data: wireHistory.array().parse(data) };
  }
  if (command === "gameHistoryOtherScores") {
    return { command, data: otherScores.parse(data) };
  }
  // Spectators use the lobby's wire spectator schema rather than the shared one.
  if (command === "spectators") {
    return {
      command: ServerCommand.spectators,
      data: spectatorsSchema.parse(data),
    };
  }
  if (!isServerCommand(command)) {
    console.warn("Unknown server command", command);
    return undefined;
  }
  // The key selects its corresponding shared schema; preserve that correlation.
  return {
    command,
    data: SERVER_COMMAND_SCHEMAS[command].parse(data),
  } as ServerEvent;
}
