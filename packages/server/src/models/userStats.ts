import type { UserID } from "@hanabi-live/data";
import { and, eq } from "drizzle-orm";
import { userStatsTable } from "../databaseSchema";
import { db } from "../db";
import type { UserStatsRow } from "../interfaces/UserStatsRow";

export const userStats = {
  get: async (userID: UserID, variantID: number): Promise<UserStatsRow> => {
    const [row] = await db
      .select()
      .from(userStatsTable)
      .where(
        and(
          eq(userStatsTable.userID, userID),
          eq(userStatsTable.variantID, variantID),
        ),
      );
    return {
      numGames: row?.numGames ?? 0,
      bestScores: [
        {
          numPlayers: 2,
          score: row?.bestScore2 ?? 0,
          modifier: row?.bestScore2Mod ?? 0,
        },
        {
          numPlayers: 3,
          score: row?.bestScore3 ?? 0,
          modifier: row?.bestScore3Mod ?? 0,
        },
        {
          numPlayers: 4,
          score: row?.bestScore4 ?? 0,
          modifier: row?.bestScore4Mod ?? 0,
        },
        {
          numPlayers: 5,
          score: row?.bestScore5 ?? 0,
          modifier: row?.bestScore5Mod ?? 0,
        },
        {
          numPlayers: 6,
          score: row?.bestScore6 ?? 0,
          modifier: row?.bestScore6Mod ?? 0,
        },
      ],
      averageScore: row?.averageScore ?? 0,
      numStrikeouts: row?.numStrikeouts ?? 0,
    };
  },
  /** @returns The stats for every variant that the user has played, indexed by variant ID. */
  getAll: async (userID: UserID): Promise<Map<number, UserStatsRow>> => {
    const rows = await db
      .select()
      .from(userStatsTable)
      .where(eq(userStatsTable.userID, userID))
      .orderBy(userStatsTable.variantID);

    const statsMap = new Map<number, UserStatsRow>();
    for (const row of rows) {
      statsMap.set(row.variantID, {
        numGames: row.numGames,
        bestScores: [
          { numPlayers: 2, score: row.bestScore2, modifier: row.bestScore2Mod },
          { numPlayers: 3, score: row.bestScore3, modifier: row.bestScore3Mod },
          { numPlayers: 4, score: row.bestScore4, modifier: row.bestScore4Mod },
          { numPlayers: 5, score: row.bestScore5, modifier: row.bestScore5Mod },
          { numPlayers: 6, score: row.bestScore6, modifier: row.bestScore6Mod },
        ],
        averageScore: row.averageScore,
        numStrikeouts: row.numStrikeouts,
      });
    }

    return statsMap;
  },
};
