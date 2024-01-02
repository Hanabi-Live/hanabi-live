import type { UserID } from "@hanabi/data";
import { and, count, eq, sql } from "drizzle-orm";
import { gameParticipantsTable, gamesTable } from "../databaseSchema";
import { db } from "../db";

export const games = {
  /** Returns 0 if the provided user ID does not exist. */
  getUserNumGames: async (
    userID: UserID,
    includeSpeedrunGames: boolean,
  ): Promise<number> => {
    const speedrunCondition = includeSpeedrunGames
      ? sql`TRUE`
      : eq(gamesTable.speedrun, false);

    const rows = await db
      .select({
        numGames: count(gamesTable.id),
      })
      .from(gamesTable)
      .innerJoin(
        gameParticipantsTable,
        eq(gamesTable.id, gameParticipantsTable.id),
      )
      .where(and(eq(gameParticipantsTable.userID, userID), speedrunCondition));

    const row = rows[0];
    if (row === undefined) {
      return 0;
    }

    return row.numGames;
  },
};
