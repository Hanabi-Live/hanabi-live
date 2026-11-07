import type { ServerCommand, ServerCommandData } from "@hanabi-live/data";
import {
  SERVER_COMMAND_SCHEMAS,
  gameHistory,
  unpackWSMessage,
} from "@hanabi-live/data";
import type { z } from "zod";

export const wireHistory = gameHistory.unwrap();
export type HistoryGame = z.infer<typeof wireHistory>;
const tableSchema = SERVER_COMMAND_SCHEMAS.table.unwrap();
export type Pregame = ServerCommandData[ServerCommand.game];
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

// The store keeps history games mutable.
const otherScores = SERVER_COMMAND_SCHEMAS.gameHistoryOtherScores
  .unwrap()
  .extend({ games: wireHistory.array() });

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
  if (command === "gameHistory") {
    return { command, data: wireHistory.array().parse(data) };
  }
  if (command === "gameHistoryOtherScores") {
    return { command, data: otherScores.parse(data) };
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
