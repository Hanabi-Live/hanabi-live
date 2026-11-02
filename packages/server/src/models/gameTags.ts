import type { GameID, UserID } from "@hanabi-live/data";
import { and, asc, eq } from "drizzle-orm";
import { gameTagsTable, gamesTable } from "../databaseSchema";
import { db } from "../db";

export const gameTags = {
  edit: async (
    gameID: GameID,
    userID: UserID,
    edit:
      | { readonly type: "add" | "delete"; readonly tag: string }
      | { readonly type: "deleteAll" },
  ): Promise<"changed" | "missing-game" | "duplicate" | "missing-tag"> =>
    await db.transaction(async (tx) => {
      // Separate replay tables for one game must not race the tag existence check.
      const games = await tx
        .select({ id: gamesTable.id })
        .from(gamesTable)
        .where(eq(gamesTable.id, gameID))
        .for("update");
      if (games.length === 0) {
        return "missing-game";
      }
      const author = and(
        eq(gameTagsTable.gameID, gameID),
        eq(gameTagsTable.userID, userID),
      );
      if (edit.type === "deleteAll") {
        await tx.delete(gameTagsTable).where(author);
        return "changed";
      }
      const matching = and(author, eq(gameTagsTable.tag, edit.tag));
      const existing = await tx
        .select({ tag: gameTagsTable.tag })
        .from(gameTagsTable)
        .where(matching)
        .limit(1);
      if (edit.type === "add") {
        if (existing.length > 0) {
          return "duplicate";
        }
        await tx
          .insert(gameTagsTable)
          .values({ gameID, userID, tag: edit.tag });
      } else {
        if (existing.length === 0) {
          return "missing-tag";
        }
        await tx.delete(gameTagsTable).where(matching);
      }
      return "changed";
    }),

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
