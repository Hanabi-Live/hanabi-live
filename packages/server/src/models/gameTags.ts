import type { GameID, UserID } from "@hanabi-live/data";
import { asc, eq } from "drizzle-orm";
import { gameTagsTable } from "../databaseSchema";
import { db } from "../db";

export const gameTags = {
  getForUser: async (
    userID: UserID,
  ): Promise<ReadonlyArray<{ gameID: GameID; tag: string }>> => {
    const rows = await db
      .select({ gameID: gameTagsTable.gameID, tag: gameTagsTable.tag })
      .from(gameTagsTable)
      .where(eq(gameTagsTable.userID, userID))
      .orderBy(asc(gameTagsTable.gameID), asc(gameTagsTable.tag));
    return rows as Array<{ gameID: GameID; tag: string }>;
  },

  getGameIDsForTag: async (tag: string): Promise<readonly GameID[]> => {
    const rows = await db
      .selectDistinct({ gameID: gameTagsTable.gameID })
      .from(gameTagsTable)
      .where(eq(gameTagsTable.tag, tag))
      .orderBy(asc(gameTagsTable.gameID));
    return rows.map((row) => row.gameID) as GameID[];
  },
};
