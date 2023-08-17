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
      throw new Error(
        'Failed to retrieve the a chat log message from the database when testing to see if the database is operational. Did you already run the "install_database_schema.sh" script to set up the database?',
      );
    }
  },
};
