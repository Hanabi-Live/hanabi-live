import { getVariantByID } from "@hanabi-live/game";
import { asc, eq } from "drizzle-orm";
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

export const replays = {
  // eslint-disable-next-line @typescript-eslint/explicit-module-boundary-types
  get: async (id: number) =>
    await db.transaction(
      async (tx) => {
        const records = await tx
          .select()
          .from(gamesTable)
          .where(eq(gamesTable.id, id))
          .limit(1);
        const game = records[0];
        if (game === undefined) {
          return undefined;
        }
        const decks = await tx
          .select({ deck: gameCustomDecksTable.deck })
          .from(gameCustomDecksTable)
          .where(eq(gameCustomDecksTable.gameID, id))
          .limit(1);
        const storedDeck = decks[0];
        const customDeck =
          storedDeck === undefined
            ? undefined
            : decodeCustomDeck(storedDeck.deck, getVariantByID(game.variantID));
        const players = await tx
          .select({
            userID: usersTable.id,
            name: usersTable.username,
            seat: gameParticipantsTable.seat,
            characterAssignment: gameParticipantsTable.characterAssignment,
            characterMetadata: gameParticipantsTable.characterMetadata,
          })
          .from(gameParticipantsTable)
          .innerJoin(
            usersTable,
            eq(usersTable.id, gameParticipantsTable.userID),
          )
          .where(eq(gameParticipantsTable.gameID, id))
          .orderBy(asc(gameParticipantsTable.seat));
        const actions = await tx
          .select({
            type: gameActionsTable.type,
            target: gameActionsTable.target,
            value: gameActionsTable.value,
          })
          .from(gameActionsTable)
          .where(eq(gameActionsTable.gameID, id))
          .orderBy(asc(gameActionsTable.turn));
        const notes = await tx
          .select({
            seat: gameParticipantsTable.seat,
            order: gameParticipantNotesTable.cardOrder,
            note: gameParticipantNotesTable.note,
          })
          .from(gameParticipantNotesTable)
          .innerJoin(
            gameParticipantsTable,
            eq(
              gameParticipantsTable.id,
              gameParticipantNotesTable.gameParticipantID,
            ),
          )
          .where(eq(gameParticipantsTable.gameID, id))
          .orderBy(
            asc(gameParticipantsTable.seat),
            asc(gameParticipantNotesTable.cardOrder),
          );
        return {
          game,
          players,
          actions,
          notes,
          ...(customDeck !== undefined && { customDeck }),
        };
      },
      { isolationLevel: "repeatable read", accessMode: "read only" },
    ),
};
