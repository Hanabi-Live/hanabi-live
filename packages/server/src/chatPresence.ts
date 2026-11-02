import type {
  ClientCommandData,
  ServerCommandData,
  UserID,
} from "@hanabi-live/data";
import { ServerCommand } from "@hanabi-live/data";
import { incomingCommands } from "./commandAdmission";
import type { Table, TableTypingEntry } from "./interfaces/Table";
import { logger } from "./logger";
import { enqueueTableOperation } from "./tableQueue";
import { getTable, getTableAudience, getTableIDs } from "./tables";
import { wsSend, wsWarning } from "./wsHelpers";
import type { WSUser } from "./wsUsers";
import { wsUsers } from "./wsUsers";

function notify(table: Table, author: UserID, name: string, typing: boolean) {
  for (const user of getTableAudience(table)) {
    if (user.userID !== author) {
      wsSend(user.connection, ServerCommand.chatTyping, {
        tableID: table.id,
        name,
        typing,
      });
    }
  }
}

export function clearTyping(table: Table, userID: UserID): void {
  const entry = table.typingTimers?.get(userID);
  if (entry === undefined) {
    return;
  }
  clearTimeout(entry.timer);
  table.typingTimers?.delete(userID);
  notify(table, userID, entry.name, false);
}

export function clearAllTyping(): void {
  for (const id of getTableIDs()) {
    const table = getTable(id);
    if (table?.typingTimers !== undefined) {
      for (const userID of table.typingTimers.keys()) {
        clearTyping(table, userID);
      }
    }
  }
}

export function getTypingState(
  table: Table,
  recipient: WSUser,
): ReadonlyArray<ServerCommandData["chatTyping"]> {
  const states: Array<ServerCommandData["chatTyping"]> = [];
  if (table.typingTimers === undefined) {
    return states;
  }
  for (const entry of table.typingTimers.values()) {
    if (
      entry.user !== recipient
      && wsUsers.get(entry.user.userID) === entry.user
    ) {
      states.push({ tableID: table.id, name: entry.name, typing: true });
    }
  }
  return states;
}

function arm(table: Table, user: WSUser, name: string, delay: number) {
  const previous = table.typingTimers?.get(user.userID);
  if (previous !== undefined) {
    clearTimeout(previous.timer);
  }
  const timer = setTimeout(() => {
    expire(table, entry).catch((error: unknown) => {
      logger.error(`Typing expiry failed: ${String(error)}`);
    });
  }, delay);
  timer.unref();
  const entry = { user, name, timer };
  const current = table;
  current.typingTimers ??= new Map();
  current.typingTimers.set(user.userID, entry);
}

async function expire(table: Table, entry: TableTypingEntry) {
  await incomingCommands.run(async () => {
    const admitted = await enqueueTableOperation(table.id, () => {
      if (
        getTable(table.id) === table
        && table.typingTimers?.get(entry.user.userID) === entry
      ) {
        clearTyping(table, entry.user.userID);
      }
    });
    if (
      !admitted
      && getTable(table.id) === table
      && table.typingTimers?.get(entry.user.userID) === entry
    ) {
      arm(table, entry.user, entry.name, 25);
    }
  });
}

async function presence(
  user: WSUser,
  data: ClientCommandData["chatRead"],
  typing: boolean,
) {
  const admitted = await enqueueTableOperation(data.tableID, () => {
    if (
      wsUsers.get(user.userID) !== user
      || user.connection.readyState !== user.connection.OPEN
    ) {
      return;
    }
    const table = getTable(data.tableID);
    if (table === undefined) {
      if (typing) {
        wsWarning(user.connection, `Table ${data.tableID} does not exist.`);
      }
      return;
    }
    const member =
      table.spectators.find((spectator) => spectator.userID === user.userID)
      ?? (table.replay
        ? undefined
        : table.players.find((player) => player.userID === user.userID));
    if (member === undefined || (table.replay && user.tableID !== table.id)) {
      if (typing) {
        wsWarning(
          user.connection,
          "You are not playing or spectating at this table.",
        );
      }
      return;
    }
    if (!typing) {
      table.chatRead.set(user.userID, table.chat.length);
      return;
    }
    if (table.recoveryBlocked === true) {
      wsWarning(user.connection, "This table is frozen until recovery.");
      return;
    }
    const previous = table.typingTimers?.get(user.userID);
    if (previous === undefined) {
      notify(table, user.userID, member.name, true);
    }
    arm(table, user, member.name, 2000);
  });
  if (!admitted) {
    wsWarning(
      user.connection,
      "Too many pending table commands. Please try again.",
    );
  }
}

export async function commandChatRead(
  user: WSUser,
  data: ClientCommandData["chatRead"],
): Promise<void> {
  await presence(user, data, false);
}

export async function commandChatTyping(
  user: WSUser,
  data: ClientCommandData["chatTyping"],
): Promise<void> {
  await presence(user, data, true);
}
