import { asc, eq } from "drizzle-orm";
import {
  gameActionsTable,
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
        return { game, players, actions, notes };
      },
      { isolationLevel: "repeatable read", accessMode: "read only" },
    ),
};
