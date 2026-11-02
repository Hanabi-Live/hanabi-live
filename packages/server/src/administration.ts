import { PROJECT_NAME, ServerCommand, Status } from "@hanabi-live/data";
import { assertDefined } from "complete-common";
import { chatMessageToWire } from "./chatMessage";
import { getGameRuntime } from "./gameRuntime";
import { logger } from "./logger";
import { models } from "./models";
import { leaveTable, tableNotice } from "./tableNotifications";
import { enqueueTableOperation } from "./tableQueue";
import { getTable, getTableIDs, removeTable } from "./tables";
import { wsSend, wsSendAll } from "./wsHelpers";
import { getUserData, wsUsers } from "./wsUsers";

export function activeGameCount(): number {
  return getTableIDs().filter((id) => {
    const table = getTable(id);
    return (
      table?.running === true && !table.replay && table.recoveryBlocked !== true
    );
  }).length;
}

export async function terminateActiveGames(): Promise<void> {
  const runtime = getGameRuntime();
  assertDefined(runtime, "Game runtime is not initialized.");
  for (const id of getTableIDs()) {
    const table = getTable(id);
    if (
      table?.running === true
      && !table.replay
      && table.recoveryBlocked !== true
    ) {
      // eslint-disable-next-line no-await-in-loop
      await runtime.terminateByServer(id);
    }
  }
}

export async function clearPregames(): Promise<void> {
  for (const id of getTableIDs()) {
    // eslint-disable-next-line no-await-in-loop
    const admitted = await enqueueTableOperation(id, () => {
      const table = getTable(id);
      if (
        table === undefined
        || table.running
        || table.replay
        || table.recoveryBlocked === true
      ) {
        return;
      }
      for (const player of table.players) {
        leaveTable(table, player);
      }
      for (const spectator of table.spectators) {
        const user = wsUsers.get(spectator.userID);
        if (user?.tableID === id) {
          user.status = Status.Lobby;
          user.tableID = undefined;
          wsSendAll(ServerCommand.user, getUserData(user));
          wsSend(user.connection, ServerCommand.left, { tableID: id });
        }
      }
      if (getTable(id) !== undefined) {
        removeTable(id);
        if (table.visible) {
          wsSendAll(ServerCommand.tableGone, { tableID: id });
        }
      }
    });
    if (!admitted) {
      throw new Error("Table queue is full; pregame cleanup must be retried.");
    }
  }
}

export async function announceServer(message: string): Promise<void> {
  const failures: unknown[] = [];
  const stored = await models.chatLog.insertServer(message, "lobby");
  wsSendAll(
    ServerCommand.chat,
    chatMessageToWire({
      kind: "lobby",
      source: "server",
      text: message,
      who: PROJECT_NAME,
      datetime: stored.datetimeSent.toISOString(),
      room: "lobby",
      chatID: stored.chatID,
    }),
  );
  const runtime = getGameRuntime();
  assertDefined(runtime, "Game runtime is not initialized.");
  for (const id of getTableIDs()) {
    const table = getTable(id);
    if (table === undefined) {
      continue;
    }
    try {
      if (table.running) {
        // eslint-disable-next-line no-await-in-loop
        await runtime.sendNotice(id, message);
      } else {
        // eslint-disable-next-line no-await-in-loop
        const admitted = await enqueueTableOperation(id, () => {
          const current = getTable(id);
          if (
            current !== undefined
            && !current.running
            && current.recoveryBlocked !== true
          ) {
            tableNotice(current, message);
          }
        });
        if (!admitted) {
          throw new Error("Table queue is full; announcement must be retried.");
        }
      }
    } catch (error) {
      logger.error(`Server notice for table ${id} failed: ${String(error)}`);
      failures.push(error);
    }
  }
  if (failures.length > 0) {
    throw new AggregateError(
      failures,
      "Not all server notices were delivered.",
    );
  }
}
