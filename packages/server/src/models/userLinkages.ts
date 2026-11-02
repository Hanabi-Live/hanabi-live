import type { UserID } from "@hanabi-live/data";
import { and, eq, inArray, or } from "drizzle-orm";
import {
  gameParticipantsTable,
  gamesTable,
  userLinkagesTable,
  usersTable,
} from "../databaseSchema";
import { db } from "../db";
import { sortUsernames } from "../utils";

export const userLinkages = {
  getBlockedSeeds: async (
    userIDs: readonly UserID[],
  ): Promise<ReadonlySet<string>> => {
    const linked = db
      .select({ id: userLinkagesTable.linkedID })
      .from(userLinkagesTable)
      .where(inArray(userLinkagesTable.userID, [...userIDs]));
    const rows = await db
      .selectDistinct({ seed: gamesTable.seed })
      .from(gamesTable)
      .innerJoin(
        gameParticipantsTable,
        eq(gamesTable.id, gameParticipantsTable.gameID),
      )
      .where(
        or(
          inArray(gameParticipantsTable.userID, [...userIDs]),
          inArray(gameParticipantsTable.userID, linked),
        ),
      );
    return new Set(rows.map((row) => row.seed));
  },
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
