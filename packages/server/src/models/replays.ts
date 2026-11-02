import { userID } from "@hanabi-live/data";
import { getVariantByID } from "@hanabi-live/game";
import { eq, getTableColumns, sql } from "drizzle-orm";
import { z } from "zod";
import { decodeCustomDeck } from "../customDeck";
import {
  gameActionsTable,
  gameCustomDecksTable,
  gameParticipantNotesTable,
  gameParticipantsTable,
  gamesTable,
  usersTable,
} from "../databaseSchema";
import { db } from "../db";

const playersSchema = z
  .object({
    userID,
    name: z.string(),
    seat: z.int(),
    characterAssignment: z.int(),
    characterMetadata: z.int(),
  })
  .array();
const actionsSchema = z
  .object({
    type: z.int(),
    target: z.int(),
    value: z.int(),
  })
  .array();
const notesSchema = z
  .object({
    seat: z.int(),
    order: z.int(),
    note: z.string(),
  })
  .array();

function prepareReplayQuery(database: typeof db) {
  return database
    .select({
      game: getTableColumns(gamesTable),
      deck: gameCustomDecksTable.deck,
      players: sql`
        (
          SELECT COALESCE(jsonb_agg(jsonb_build_object(
            'userID', ${usersTable.id}, 'name', ${usersTable.username},
            'seat', ${gameParticipantsTable.seat},
            'characterAssignment', ${gameParticipantsTable.characterAssignment},
            'characterMetadata', ${gameParticipantsTable.characterMetadata}
          ) ORDER BY ${gameParticipantsTable.seat}), '[]'::jsonb)
          FROM ${gameParticipantsTable}
          JOIN ${usersTable} ON ${usersTable.id} = ${gameParticipantsTable.userID}
          WHERE ${gameParticipantsTable.gameID} = ${gamesTable.id}
        )
      `.mapWith((value: unknown) => playersSchema.parse(value)),
      actions: sql`
        (
          SELECT COALESCE(jsonb_agg(jsonb_build_object(
            'type', ${gameActionsTable.type}, 'target', ${gameActionsTable.target},
            'value', ${gameActionsTable.value}
          ) ORDER BY ${gameActionsTable.turn}), '[]'::jsonb)
          FROM ${gameActionsTable} WHERE ${gameActionsTable.gameID} = ${gamesTable.id}
        )
      `.mapWith((value: unknown) => actionsSchema.parse(value)),
      notes: sql`
        (
          SELECT COALESCE(jsonb_agg(jsonb_build_object(
            'seat', ${gameParticipantsTable.seat},
            'order', ${gameParticipantNotesTable.cardOrder}, 'note', ${gameParticipantNotesTable.note}
          ) ORDER BY ${gameParticipantsTable.seat}, ${gameParticipantNotesTable.cardOrder}), '[]'::jsonb)
          FROM ${gameParticipantNotesTable}
          JOIN ${gameParticipantsTable} ON ${gameParticipantsTable.id} = ${gameParticipantNotesTable.gameParticipantID}
          WHERE ${gameParticipantsTable.gameID} = ${gamesTable.id}
        )
      `.mapWith((value: unknown) => notesSchema.parse(value)),
    })
    .from(gamesTable)
    .leftJoin(
      gameCustomDecksTable,
      eq(gameCustomDecksTable.gameID, gamesTable.id),
    )
    .where(eq(gamesTable.id, sql.placeholder("id")))
    .limit(1)
    .prepare("historical_replay");
}

const queries = new WeakMap<typeof db, ReturnType<typeof prepareReplayQuery>>();

export const replays = {
  // eslint-disable-next-line @typescript-eslint/explicit-module-boundary-types
  get: async (id: number) => {
    let query = queries.get(db);
    if (query === undefined) {
      query = prepareReplayQuery(db);
      queries.set(db, query);
    }
    // One statement gives every component the same snapshot without a multi-query transaction.
    const [record] = await query.execute({ id });
    if (record === undefined) {
      return undefined;
    }
    const { game, players, actions, notes } = record;
    const storedDeck = record.deck ?? undefined;
    const customDeck =
      storedDeck === undefined
        ? undefined
        : decodeCustomDeck(storedDeck, getVariantByID(game.variantID));
    return {
      game,
      players,
      actions,
      notes,
      ...(customDeck !== undefined && { customDeck }),
    };
  },
};
