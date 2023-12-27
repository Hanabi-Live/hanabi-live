import { chatLogTable } from "../databaseSchema";
import { db } from "../db";

export const chatLog = {
  testDatabase: async (): Promise<void> => {
    const chatLogs = await db
      .select({
        message: chatLogTable.message,
      })
      .from(chatLogTable)
      .limit(1);
    const firstChatLog = chatLogs[0];

    if (firstChatLog === undefined || firstChatLog.message === "") {
      throw new Error("Failed to get the first chat log message.");
    }
  },
};
