import type { GameHistory, GameID, UserID } from "@hanabi-live/data";
import { serverCommandGameHistoryData } from "@hanabi-live/data";
import { getVariantByID } from "@hanabi-live/game";
import { and, asc, count, desc, eq, inArray, sql } from "drizzle-orm";
import { except } from "drizzle-orm/pg-core";
import { gameParticipantsTable, gamesTable } from "../databaseSchema";
import { db } from "../db";

export const games = {
  /** Returns 0 if the provided user ID does not exist. */
  getNumGamesForUser: async (
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
        eq(gamesTable.id, gameParticipantsTable.gameID),
      )
      .where(and(eq(gameParticipantsTable.userID, userID), speedrunCondition));

    const row = rows[0];
    if (row === undefined) {
      return 0;
    }

    return row.numGames;
  },

  getGameIDsForUser: async (
    userID: UserID,
    offset: number,
    amount: number,
  ): Promise<readonly GameID[]> => {
    const query = db
      .select({
        id: gamesTable.id,
      })
      .from(gamesTable)
      .innerJoin(
        gameParticipantsTable,
        eq(gamesTable.id, gameParticipantsTable.gameID),
      )
      .where(eq(gameParticipantsTable.userID, userID))
      .orderBy(desc(gamesTable.datetimeFinished), desc(gamesTable.id));
    const queryWithLimit =
      amount > 0 ? query.limit(amount).offset(offset) : query;
    const rows = await queryWithLimit;

    const gameIDs = rows.map((row) => row.id);

    // A type assertion is necessary since we are branding the game ID.
    return gameIDs as GameID[];
  },

  getGameIDsForUserFriends: async (
    userID: UserID,
    friendsSet: ReadonlySet<UserID>,
    offset: number,
    amount: number,
  ): Promise<readonly GameID[]> => {
    if (friendsSet.size === 0) {
      return [];
    }

    const friendsUserIDs = [...friendsSet];

    const friendGameIDs = db
      .selectDistinct({
        gameID: gameParticipantsTable.gameID,
      })
      .from(gameParticipantsTable)
      .where(inArray(gameParticipantsTable.userID, friendsUserIDs));

    const ourGameIDs = db
      .select({
        gameID: gameParticipantsTable.gameID,
      })
      .from(gameParticipantsTable)
      .where(eq(gameParticipantsTable.userID, userID));

    const availableGameIDs = except(friendGameIDs, ourGameIDs).as(
      "friend_games",
    );
    const rows = await db
      .select({ gameID: gamesTable.id })
      .from(gamesTable)
      .innerJoin(availableGameIDs, eq(gamesTable.id, availableGameIDs.gameID))
      .orderBy(desc(gamesTable.datetimeFinished), desc(gamesTable.id))
      .limit(amount)
      .offset(offset);

    const gameIDs = rows.map((row) => row.gameID);

    // A type assertion is necessary since we are branding the game ID.
    return gameIDs as GameID[];
  },

  getGameIDsForSeed: async (seed: string): Promise<readonly GameID[]> => {
    const rows = await db
      .select({ id: gamesTable.id })
      .from(gamesTable)
      .where(eq(gamesTable.seed, seed));
    return rows.map((row) => row.id as GameID);
  },

  getHistory: async (
    gameIDs: readonly GameID[],
    sort: "normal" | "seed" = "normal",
  ): Promise<readonly GameHistory[]> => {
    if (gameIDs.length === 0) {
      return [];
    }

    const rows = await db
      .select({
        id: gamesTable.id,
        variantID: gamesTable.variantID,
        options: {
          numPlayers: gamesTable.numPlayers,
          timed: gamesTable.timed,
          timeBase: gamesTable.timeBase,
          timePerTurn: gamesTable.timePerTurn,
          speedrun: gamesTable.speedrun,
          cardCycle: gamesTable.cardCycle,
          deckPlays: gamesTable.deckPlays,
          emptyClues: gamesTable.emptyClues,
          oneExtraCard: gamesTable.oneExtraCard,
          oneLessCard: gamesTable.oneLessCard,
          allOrNothing: gamesTable.allOrNothing,
          detrimentalCharacters: gamesTable.detrimentalCharacters,
        },
        seed: gamesTable.seed,
        score: gamesTable.score,
        numTurns: gamesTable.numTurns,
        endCondition: gamesTable.endCondition,
        datetimeStarted: gamesTable.datetimeStarted,
        datetimeFinished: gamesTable.datetimeFinished,
        // Explicit qualifiers survive Drizzle's single-table SELECT rewriting.
        numGamesOnThisSeed: sql<number>`
          COALESCE((SELECT num_games FROM seeds WHERE seeds.seed = games.seed), 0)
        `.mapWith(Number),
        playerNames: sql<string[]>`
          ARRAY(
            SELECT users.username FROM game_participants
            JOIN users ON users.id = game_participants.user_id
            WHERE game_participants.game_id = games.id
          )
        `,
        tags: sql<string>`
          COALESCE((
            SELECT STRING_AGG(DISTINCT tag, ', ' ORDER BY tag)
            FROM game_tags WHERE game_id = games.id
          ), '')
        `,
      })
      .from(gamesTable)
      .where(inArray(gamesTable.id, gameIDs))
      .orderBy(
        ...(sort === "seed"
          ? [
              desc(gamesTable.score),
              asc(gamesTable.datetimeFinished),
              asc(gamesTable.id),
            ]
          : [desc(gamesTable.datetimeFinished), desc(gamesTable.id)]),
      );

    return serverCommandGameHistoryData.parse(
      rows.map(({ variantID, playerNames, ...row }) => ({
        ...row,
        options: {
          ...row.options,
          variantID,
          variantName: getVariantByID(variantID).name,
        },
        playerNames: playerNames.toSorted((first, second) =>
          Buffer.compare(
            Buffer.from(first.toLowerCase()),
            Buffer.from(second.toLowerCase()),
          ),
        ),
        incrementNumGames: false,
      })),
    );
  },
};
