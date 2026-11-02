import type { UserID } from "@hanabi-live/data";
import { count, eq, sql } from "drizzle-orm";
import {
  gameParticipantsTable,
  gamesTable,
  usersTable,
  variantStatsTable,
} from "../databaseSchema";
import { db } from "../db";
import type { PublicStats } from "../interfaces/PublicStats";

const counts = {
  numGamesNormal:
    sql<number>`count(*) FILTER (WHERE NOT speedrun AND end_condition = 1)`.mapWith(
      Number,
    ),
  numGamesOther:
    sql<number>`count(*) FILTER (WHERE NOT speedrun AND end_condition != 1)`.mapWith(
      Number,
    ),
  numGamesSpeedrun: sql<number>`count(*) FILTER (WHERE speedrun)`.mapWith(
    Number,
  ),
};

const duration = sql`EXTRACT(EPOCH FROM datetime_finished - datetime_started)`;

export const publicStats = {
  profile: async (
    userID: UserID,
  ): Promise<PublicStats & { dateJoined: Date }> => {
    const [user] = await db
      .select({ dateJoined: usersTable.datetimeCreated })
      .from(usersTable)
      .where(eq(usersTable.id, userID));
    if (user === undefined) {
      throw new Error("Cannot read statistics for a nonexistent user.");
    }
    const [stats] = await db
      .select({
        ...counts,
        timePlayed:
          sql<number>`COALESCE(CAST(SUM(${duration}) FILTER (WHERE NOT speedrun) AS BIGINT), 0)`.mapWith(
            Number,
          ),
        timePlayedSpeedrun:
          sql<number>`COALESCE(CAST(SUM(${duration}) FILTER (WHERE speedrun) AS BIGINT), 0)`.mapWith(
            Number,
          ),
      })
      .from(gamesTable)
      .innerJoin(
        gameParticipantsTable,
        eq(gameParticipantsTable.gameID, gamesTable.id),
      )
      .where(eq(gameParticipantsTable.userID, userID));
    if (stats === undefined) {
      throw new Error("The profile aggregate returned no row.");
    }
    return { ...stats, ...user };
  },

  variant: async (variantID: number): Promise<PublicStats> => {
    // Go counts games once, but counts time once per participant.
    const participants = sql`(SELECT count(*) FROM game_participants WHERE game_id = games.id)`;
    const [stats] = await db
      .select({
        ...counts,
        timePlayed:
          sql<number>`COALESCE(CAST(SUM(${duration} * ${participants}) FILTER (WHERE NOT speedrun) AS BIGINT), 0)`.mapWith(
            Number,
          ),
        timePlayedSpeedrun:
          sql<number>`COALESCE(CAST(SUM(${duration} * ${participants}) FILTER (WHERE speedrun) AS BIGINT), 0)`.mapWith(
            Number,
          ),
      })
      .from(gamesTable)
      .where(eq(gamesTable.variantID, variantID));
    if (stats === undefined) {
      throw new Error("The variant aggregate returned no row.");
    }
    return stats;
  },

  variantScores: async (
    variantID: number,
  ): Promise<{
    numGames: number;
    bestScores: readonly number[];
    numMaxScores: number;
    averageScore: number;
    numStrikeouts: number;
  }> => {
    const [row] = await db
      .select()
      .from(variantStatsTable)
      .where(eq(variantStatsTable.variantID, variantID));
    return {
      numGames: row?.numGames ?? 0,
      bestScores: [
        row?.bestScore2 ?? 0,
        row?.bestScore3 ?? 0,
        row?.bestScore4 ?? 0,
        row?.bestScore5 ?? 0,
        row?.bestScore6 ?? 0,
      ],
      numMaxScores: row?.numMaxScores ?? 0,
      averageScore: row?.averageScore ?? 0,
      numStrikeouts: row?.numStrikeouts ?? 0,
    };
  },

  seedScores: async (
    seed: string,
  ): Promise<ReadonlyArray<{ score: number; numTimes: number }>> =>
    await db
      .select({
        score: gamesTable.score,
        numTimes: count(),
      })
      .from(gamesTable)
      .where(eq(gamesTable.seed, seed))
      .groupBy(gamesTable.score)
      .orderBy(gamesTable.score),
};
