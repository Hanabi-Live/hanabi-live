import type { GameHistory, GameID, UserID } from "@hanabi/data";
import { serverCommandGameHistoryData } from "@hanabi/data";
import { and, count, desc, eq, sql } from "drizzle-orm";
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
        eq(gamesTable.id, gameParticipantsTable.id),
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
      .orderBy(desc(gamesTable.id));
    const queryWithLimit =
      amount > 0 ? query.limit(amount).offset(offset) : query;
    const rows = await queryWithLimit;

    const gameIDs = rows.map((row) => row.id);

    // A type assertion is necessary since we are branding the game ID.
    return gameIDs as GameID[];
  },

  getHistory: async (
    gameIDs: readonly GameID[],
  ): Promise<readonly GameHistory[]> => {
    if (gameIDs.length === 0) {
      return [];
    }

    // TODO: Rewrite this function once we can do multi-select with Drizzle:
    // https://github.com/drizzle-team/drizzle-orm/pull/1405

    /*
      await db
      .select({
        id: gamesTable.id,
        numPlayers: gamesTable.numPlayers,
        variantID: gamesTable.variantID,

        // Options
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

        seed: gamesTable.seed,
        score: gamesTable.score,
        numTurns: gamesTable.numTurns,
        endCondition: gamesTable.endCondition,
        datetimeStarted: gamesTable.datetimeStarted,
        datetimeFinished: gamesTable.datetimeFinished,
      })
      .from(gamesTable)
      .where(inArray(gamesTable.id, gameIDs as GameID[]))
      .orderBy(desc(gamesTable.id));
    */

    const rows = await db.execute(
      sql`
        SELECT
          games1.id AS id,
          games1.num_players AS numPlayers,
          games1.variant_id AS variantID,

          games1.timed AS timed,
          games1.time_base AS timeBase,
          games1.time_per_turn AS timePerTurn,
          games1.speedrun AS speedrun,
          games1.card_cycle AS cardCycle,
          games1.deck_plays AS deckPlays,
          games1.empty_clues AS emptyClues,
          games1.one_extra_card AS oneExtraCard,
          games1.one_less_card AS oneLessCard,
          games1.all_or_nothing AS allOrNothing,
          games1.detrimental_characters AS detrimentalCharacters,

          games1.seed AS seed,
          games1.score AS score,
          games1.num_turns AS numTurns,
          games1.end_condition AS endCondition,
          games1.datetime_started AS datetimeStarted,
          games1.datetime_finished AS datetimeFinished,

          (
            SELECT COALESCE((
              SELECT seeds.num_games
              FROM seeds
              WHERE seeds.seed = games1.seed
            ), 0)
          ) AS numGamesOnThisSeed,
          (
            SELECT STRING_AGG(users.username, ', ')
            FROM game_participants
              JOIN users ON users.id = game_participants.user_id
            WHERE game_participants.game_id = games1.id
          ) AS playerNames,
          (
            SELECT COALESCE(STRING_AGG(DISTINCT game_tags.tag, ', ' ORDER BY game_tags.tag), '')
            FROM game_tags
            WHERE game_tags.game_id = games1.id
          ) AS tags
        FROM games AS games1
        WHERE games1.id IN (${gameIDs.join(",")})
      `,
    );

    // We parse the input from the database as a safety layer to ensure that the untyped `SELECT`
    // call is correct.
    return serverCommandGameHistoryData.parse(rows);
  },
};
