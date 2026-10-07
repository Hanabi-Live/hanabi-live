import type { ServerCommandChatPMHistoryData, UserID } from "@hanabi-live/data";
import { and, desc, eq, inArray, lt, or } from "drizzle-orm";
import { chatLogPMTable, usersTable } from "../databaseSchema";
import { db } from "../db";

interface ChatLogPMInsertResult {
  readonly pmID: number;
  readonly datetimeSent: Date;
}

export const chatLogPM = {
  insert: async (
    userID: UserID,
    recipientID: UserID,
    message: string,
  ): Promise<ChatLogPMInsertResult> => {
    const rows = await db
      .insert(chatLogPMTable)
      .values({ userID, recipientID, message })
      .returning({
        pmID: chatLogPMTable.id,
        datetimeSent: chatLogPMTable.datetimeSent,
      });

    const row = rows[0];
    if (row === undefined) {
      throw new Error("Failed to insert a private message.");
    }
    return row;
  },

  getHistory: async (
    userID: UserID,
    amount: number,
    beforeID?: number,
    peerID?: UserID,
  ): Promise<ServerCommandChatPMHistoryData> => {
    const participantFilter =
      peerID === undefined
        ? or(
            eq(chatLogPMTable.userID, userID),
            eq(chatLogPMTable.recipientID, userID),
          )
        : or(
            and(
              eq(chatLogPMTable.userID, userID),
              eq(chatLogPMTable.recipientID, peerID),
            ),
            and(
              eq(chatLogPMTable.userID, peerID),
              eq(chatLogPMTable.recipientID, userID),
            ),
          );

    const rows = await db
      .select({
        pmID: chatLogPMTable.id,
        userID: chatLogPMTable.userID,
        recipientID: chatLogPMTable.recipientID,
        msg: chatLogPMTable.message,
        datetimeSent: chatLogPMTable.datetimeSent,
      })
      .from(chatLogPMTable)
      .where(
        beforeID === undefined
          ? participantFilter
          : and(participantFilter, lt(chatLogPMTable.id, beforeID)),
      )
      .orderBy(desc(chatLogPMTable.id))
      .limit(amount + 1);

    const hasMore = rows.length > amount;
    const pageRows = rows.slice(0, amount);
    const userIDs = [
      ...new Set(pageRows.flatMap((row) => [row.userID, row.recipientID])),
    ];

    let userRows: Array<{ id: number; username: string }> = [];
    if (userIDs.length > 0) {
      userRows = await db
        .select({ id: usersTable.id, username: usersTable.username })
        .from(usersTable)
        .where(inArray(usersTable.id, userIDs));
    }

    const usernames = new Map(
      userRows.map((row) => [row.id, row.username] as const),
    );
    const list = pageRows.toReversed().map((row) => ({
      pmID: row.pmID,
      msg: row.msg,
      who: usernames.get(row.userID) ?? `Deleted user #${row.userID}`,
      recipient:
        usernames.get(row.recipientID) ?? `Deleted user #${row.recipientID}`,
      datetime: row.datetimeSent.toISOString(),
    }));

    return { list, hasMore };
  },
};
