import { chatLogPMTable } from "../databaseSchema";
import { db } from "../db";
import type { UserID } from "../types/UserID";

export const chatLogPM = {
  insert: async (
    userID: UserID,
    recipientID: UserID,
    msg: string,
  ): Promise<void> => {
    await db.insert(chatLogPMTable).values({
      userID,
      recipientID,
      message: msg,
    });
  },
};
