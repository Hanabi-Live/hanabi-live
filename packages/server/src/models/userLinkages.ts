import type { UserID } from "@hanabi-live/data";
import { and, eq } from "drizzle-orm";
import { userLinkagesTable, usersTable } from "../databaseSchema";
import { db } from "../db";
import { sortUsernames } from "../utils";

export const userLinkages = {
  set: async (
    userID: UserID,
    linkedID: UserID,
    add: boolean,
  ): Promise<boolean> => {
    if (add) {
      const rows = await db
        .insert(userLinkagesTable)
        .values({ userID, linkedID })
        .onConflictDoNothing({
          target: [userLinkagesTable.userID, userLinkagesTable.linkedID],
        })
        .returning({ linkedID: userLinkagesTable.linkedID });
      return rows.length > 0;
    }
    const rows = await db
      .delete(userLinkagesTable)
      .where(
        and(
          eq(userLinkagesTable.userID, userID),
          eq(userLinkagesTable.linkedID, linkedID),
        ),
      )
      .returning({ linkedID: userLinkagesTable.linkedID });
    return rows.length > 0;
  },

  getList: async (userID: UserID): Promise<readonly string[]> => {
    const rows = await db
      .select({ username: usersTable.username })
      .from(userLinkagesTable)
      .innerJoin(usersTable, eq(userLinkagesTable.linkedID, usersTable.id))
      .where(eq(userLinkagesTable.userID, userID));
    return sortUsernames(rows.map((row) => row.username));
  },
};
