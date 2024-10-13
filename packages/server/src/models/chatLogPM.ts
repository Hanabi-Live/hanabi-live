import type { UserID } from "@hanabi-live/data";
import { chatLogPMTable } from "../databaseSchema";
import { db } from "../db";

export const chatLogPM = {
  insert: async (
    userID: UserID,
    recipientID: UserID,
    message: string,
  ): Promise<void> => {
    await db.insert(chatLogPMTable).values({
      userID,
      recipientID,
      message,
    });
  },
};
