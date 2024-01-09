import type { UserID } from "@hanabi/data";
import { eq } from "drizzle-orm";
import { userFriendsTable, usersTable } from "../databaseSchema";
import { db } from "../db";

export const userFriends = {
  getList: async (userID: UserID): Promise<readonly string[]> => {
    const friendsRows = await db
      .select({
        username: usersTable.username,
      })
      .from(userFriendsTable)
      .innerJoin(usersTable, eq(userFriendsTable.friendID, usersTable.id))
      .where(eq(userFriendsTable.userID, userID));

    return friendsRows.map((friendsRow) => friendsRow.username);
  },
};
