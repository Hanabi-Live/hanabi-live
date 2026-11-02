import type { UserID } from "@hanabi-live/data";
import { and, eq } from "drizzle-orm";
import {
  userFriendsTable,
  userReverseFriendsTable,
  usersTable,
} from "../databaseSchema";
import { db } from "../db";
import { sortUsernames } from "../utils";

export const userFriends = {
  set: async (
    userID: UserID,
    friendID: UserID,
    add: boolean,
  ): Promise<boolean> =>
    await db.transaction(async (tx) => {
      const users = await tx
        .select({ id: usersTable.id })
        .from(usersTable)
        .where(eq(usersTable.id, userID))
        .for("update");
      if (users.length === 0) {
        throw new Error("Cannot change friends for a missing user.");
      }
      const relationship = and(
        eq(userFriendsTable.userID, userID),
        eq(userFriendsTable.friendID, friendID),
      );
      const existing = await tx
        .select({ friendID: userFriendsTable.friendID })
        .from(userFriendsTable)
        .where(relationship)
        .limit(1);
      if (add === existing.length > 0) {
        return false;
      }
      const reverse = and(
        eq(userReverseFriendsTable.userID, friendID),
        eq(userReverseFriendsTable.friendID, userID),
      );
      if (add) {
        await tx.insert(userFriendsTable).values({ userID, friendID });
        await tx.delete(userReverseFriendsTable).where(reverse);
        await tx
          .insert(userReverseFriendsTable)
          .values({ userID: friendID, friendID: userID });
      } else {
        await tx.delete(userFriendsTable).where(relationship);
        await tx.delete(userReverseFriendsTable).where(reverse);
      }
      return true;
    }),

  getList: async (userID: UserID): Promise<readonly string[]> => {
    const friendsRows = await db
      .select({
        username: usersTable.username,
      })
      .from(userFriendsTable)
      .innerJoin(usersTable, eq(userFriendsTable.friendID, usersTable.id))
      .where(eq(userFriendsTable.userID, userID));

    return sortUsernames(friendsRows.map((friendsRow) => friendsRow.username));
  },
};
