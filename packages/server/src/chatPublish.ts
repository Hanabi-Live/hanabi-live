import type { TableID } from "@hanabi-live/data";
import { PROJECT_NAME, ServerCommand } from "@hanabi-live/data";
import { assertDefined } from "complete-common";
import { chatMessageToWire } from "./chatMessage";
import { parseChatTarget } from "./chatTarget";
import { NUM_CONSECUTIVE_DIACRITICS_ALLOWED } from "./constants";
import { getDiscordBridge } from "./discordRuntime";
import { getGameRuntime } from "./gameRuntime";
import { logger } from "./logger";
import { models } from "./models";
import { tableNotice } from "./tableNotifications";
import { enqueueTableOperation } from "./tableQueue";
import { getTable } from "./tables";
import { getMaxConsecutiveMarks, truncateToMaxBytes } from "./utils";
import { wsSendAll } from "./wsHelpers";

export async function sendServerChat(
  text: string,
  room: string,
  development = false,
): Promise<void> {
  const message = truncateToMaxBytes(text, 600)
    .replaceAll(/[^\p{L}\p{M}\p{N}\p{P}\p{S} ]/gu, "")
    .trim();
  if (
    message === ""
    || getMaxConsecutiveMarks(message) > NUM_CONSECUTIVE_DIACRITICS_ALLOWED
  ) {
    throw new Error("Invalid generated server chat message.");
  }
  const target = parseChatTarget(room);
  if (target === undefined) {
    throw new Error("Invalid generated server chat destination.");
  }
  if (target.kind === "lobby") {
    const stored = await models.chatLog.insertServer(message, room);
    wsSendAll(
      ServerCommand.chat,
      chatMessageToWire({
        kind: "lobby",
        source: "server",
        text: message,
        who: PROJECT_NAME,
        datetime: stored.datetimeSent.toISOString(),
        room,
        chatID: stored.chatID,
      }),
    );
    await getDiscordBridge()?.sendPublicMessage(stored.chatID, development);
    return;
  }
  const id = target.tableID as TableID;
  const table = getTable(id);
  if (table === undefined) {
    logger.info(`Server chat destination ${room} was removed before delivery.`);
    return;
  }
  if (table.running) {
    const runtime = getGameRuntime();
    assertDefined(runtime, "Game runtime is not initialized.");
    await runtime.sendNotice(id, message);
    return;
  }
  const delivery = { running: false };
  const admitted = await enqueueTableOperation(id, () => {
    const current = getTable(id);
    if (current === undefined) {
      logger.info(
        `Server chat destination ${room} was removed before delivery.`,
      );
      return;
    }
    if (current.recoveryBlocked === true) {
      throw new Error("Server chat destination is frozen until recovery.");
    }
    if (current.running) {
      delivery.running = true;
      return;
    }
    tableNotice(current, message);
  });
  if (!admitted) {
    throw new Error("Table queue is full; server chat must be retried.");
  }
  if (delivery.running) {
    const runtime = getGameRuntime();
    assertDefined(runtime, "Game runtime is not initialized.");
    await runtime.sendNotice(id, message);
  }
}
