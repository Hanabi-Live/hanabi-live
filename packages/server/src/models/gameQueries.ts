import type { GameID } from "@hanabi-live/data";
import { assertDefined } from "complete-common";
import type { SQL } from "drizzle-orm";
import { and, asc, count, desc, eq, exists, sql } from "drizzle-orm";
import type {
  PublicGameQuery,
  PublicGameRow,
  PublicGameSelection,
} from "../apiQuery";
import {
  gameParticipantsTable,
  gamesTable,
  usersTable,
} from "../databaseSchema";
import { db } from "../db";

const COLUMNS = {
  id: gamesTable.id,
  numPlayers: gamesTable.numPlayers,
  score: gamesTable.score,
  variantID: gamesTable.variantID,
} as const;

function selectionFilters(selection: PublicGameSelection): readonly SQL[] {
  const filters: SQL[] = [];
  if (selection.userIDs !== undefined) {
    for (const userID of selection.userIDs) {
      const participation = db
        .select({ gameID: gameParticipantsTable.gameID })
        .from(gameParticipantsTable)
        .where(
          and(
            eq(gameParticipantsTable.gameID, gamesTable.id),
            eq(gameParticipantsTable.userID, userID),
          ),
        );
      filters.push(exists(participation));
    }
  }
  if (selection.seed !== undefined) {
    filters.push(eq(gamesTable.seed, selection.seed));
  }
  if (selection.variantID !== undefined) {
    filters.push(eq(gamesTable.variantID, selection.variantID));
  }
  if (selection.start !== undefined) {
    filters.push(sql`${gamesTable.id} >= ${selection.start}::bigint`);
  }
  if (selection.end !== undefined) {
    filters.push(sql`${gamesTable.id} <= ${selection.end}::bigint`);
  }
  return filters;
}

export const gameQueries = {
  list: async (
    query: PublicGameQuery,
  ): Promise<{
    totalRows: number;
    rows: readonly PublicGameRow[];
  }> => {
    const conditions = [
      ...selectionFilters(query),
      ...query.filters.map(
        ({ field, value }) => sql`${COLUMNS[field]} = ${value}::bigint`,
      ),
    ];
    const where = and(...conditions);
    const counts = await db
      .select({ total: count() })
      .from(gamesTable)
      .where(where);
    const total = counts[0];
    assertDefined(total, "Game count query did not return a row.");
    const order = query.ascending
      ? asc(COLUMNS[query.order])
      : desc(COLUMNS[query.order]);
    const rows = await db
      .select({
        id: gamesTable.id,
        num_players: gamesTable.numPlayers,
        score: gamesTable.score,
        variant: gamesTable.variantID,
        users: sql<string>`STRING_AGG(${usersTable.username}, ', ' ORDER BY LOWER(${usersTable.username}))`,
        datetime: sql<string>`TO_CHAR(${gamesTable.datetimeFinished}, 'YYYY-MM-DD" - "HH24:MI:SS TZ')`,
        seed: gamesTable.seed,
        other_scores: sql<number>`
          COALESCE((SELECT num_games FROM seeds WHERE seeds.seed = games.seed), 0)
        `.mapWith(Number),
      })
      .from(gamesTable)
      .innerJoin(
        gameParticipantsTable,
        eq(gameParticipantsTable.gameID, gamesTable.id),
      )
      .innerJoin(usersTable, eq(usersTable.id, gameParticipantsTable.userID))
      .where(where)
      .groupBy(gamesTable.id)
      .orderBy(order, desc(gamesTable.id))
      .limit(query.size)
      .offset(query.offset);
    return { totalRows: total.total, rows };
  },

  fullIDs: async (
    selection: PublicGameSelection,
  ): Promise<readonly GameID[]> => {
    const rows = await db
      .select({ id: gamesTable.id })
      .from(gamesTable)
      .where(and(...selectionFilters(selection)));
    return rows.map(({ id }) => id as GameID);
  },
};
