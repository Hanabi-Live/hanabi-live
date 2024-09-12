import type { UserID } from "@hanabi-live/data";
import { desc, eq } from "drizzle-orm";
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
        username: usersTable.username,
        discordName: chatLogTable.discordName,
        message: chatLogTable.message,
        datetimeSent: chatLogTable.datetimeSent,
      })
      .from(chatLogTable)
      .leftJoin(usersTable, eq(usersTable.id, chatLogTable.userID))
      .where(eq(chatLogTable.room, room))
      .orderBy(desc(chatLogTable.datetimeSent), desc(chatLogTable.id));
    const queryWithLimit = count === undefined ? query : query.limit(count);
    const rows = await queryWithLimit;

    return rows;
  },

  set: async (userID: UserID, message: string, room: string): Promise<void> => {
    await db.insert(chatLogTable).values({
      userID,
      message,
      room,
    });
  },
};
