import type { UserID } from "@hanabi-live/data";
import { and, desc, eq, isNull } from "drizzle-orm";
import { chatLogTable, usersTable } from "../databaseSchema";
import { db } from "../db";

export const chatLog = {
  testDatabase: async (): Promise<void> => {
    const chatLogs = await db
      .select({
        message: chatLogTable.message,
      })
      .from(chatLogTable)
      .orderBy(chatLogTable.id)
      .limit(1);
    const firstChatLog = chatLogs[0];

    if (firstChatLog === undefined || firstChatLog.message === "") {
      throw new Error("Failed to get the first chat log message.");
    }
  },

  // eslint-disable-next-line @typescript-eslint/explicit-module-boundary-types
  get: async (room: string, count?: number) => {
    const query = db
      .select({
        chatID: chatLogTable.id,
        userID: chatLogTable.userID,
        source: chatLogTable.source,
        username: usersTable.username,
        discordName: chatLogTable.discordName,
        message: chatLogTable.message,
        datetimeSent: chatLogTable.datetimeSent,
      })
      .from(chatLogTable)
      .leftJoin(usersTable, eq(usersTable.id, chatLogTable.userID))
      .where(and(eq(chatLogTable.room, room), isNull(chatLogTable.deletedAt)))
      .orderBy(desc(chatLogTable.datetimeSent), desc(chatLogTable.id));
    const queryWithLimit = count === undefined ? query : query.limit(count);
    const rows = await queryWithLimit;

    return rows;
  },

  insert: async (
    userID: UserID,
    message: string,
    room: string,
  ): Promise<{ chatID: number; datetimeSent: Date }> =>
    await insertChatMessage(userID, "user", message, room),

  insertServer: async (
    message: string,
    room: string,
  ): Promise<{ chatID: number; datetimeSent: Date }> =>
    await insertChatMessage(0, "server", message, room),
};

async function insertChatMessage(
  userID: number,
  source: "user" | "server",
  message: string,
  room: string,
) {
  const rows = await db
    .insert(chatLogTable)
    .values({ userID, source, message, room })
    .returning({
      chatID: chatLogTable.id,
      datetimeSent: chatLogTable.datetimeSent,
    });
  const row = rows[0];
  if (row === undefined) {
    throw new Error("Chat insertion did not return a persisted message.");
  }
  return row;
}
