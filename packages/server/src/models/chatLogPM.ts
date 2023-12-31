import type { UserID } from "../../../data/src/types/UserID";
import { chatLogPMTable } from "../databaseSchema";
import { db } from "../db";

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
