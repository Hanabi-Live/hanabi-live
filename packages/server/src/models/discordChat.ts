/* eslint-disable unicorn/no-null */
import { and, eq, isNull, sql } from "drizzle-orm";
import { chatLogTable, usersTable } from "../databaseSchema";
import type { db } from "../db";

// eslint-disable-next-line @typescript-eslint/explicit-module-boundary-types
export function createDiscordChatStore(database: typeof db) {
  return {
    insertDiscord: async (
      username: string,
      message: string,
      messageID: string,
    ) =>
      await database.transaction(async (transaction) => {
        if (messageID !== "") {
          await transaction.execute(
            sql`SELECT pg_advisory_xact_lock(hashtextextended(${messageID}, 0))`,
          );
        }
        const rows = await transaction
          .insert(chatLogTable)
          .values({
            userID: 0,
            source: "discord",
            discordName: username,
            message,
            room: "lobby",
            discordMessageID: messageID === "" ? null : messageID,
          })
          .onConflictDoNothing({
            target: chatLogTable.discordMessageID,
            where: sql`${chatLogTable.discordMessageID} IS NOT NULL`,
          })
          .returning({
            chatID: chatLogTable.id,
            datetimeSent: chatLogTable.datetimeSent,
          });
        return rows[0];
      }),

    async deleteDiscord(messageID: string) {
      if (messageID === "") {
        throw new Error("Cannot delete an empty Discord message ID.");
      }
      return await database.transaction(async (transaction) => {
        await transaction.execute(
          sql`SELECT pg_advisory_xact_lock(hashtextextended(${messageID}, 0))`,
        );
        const rows = await transaction
          .insert(chatLogTable)
          .values({
            userID: 0,
            source: "discord",
            message: "",
            room: "lobby",
            discordMessageID: messageID,
            deletedAt: new Date(),
          })
          .onConflictDoUpdate({
            target: chatLogTable.discordMessageID,
            targetWhere: sql`${chatLogTable.discordMessageID} IS NOT NULL`,
            set: {
              message: "",
              discordName: null,
              deletedAt: sql`EXCLUDED.deleted_at`,
            },
            setWhere: isNull(chatLogTable.deletedAt),
          })
          .returning({ chatID: chatLogTable.id });
        return rows[0]?.chatID;
      });
    },

    async linkDiscordMessageID(chatID: number, messageID: string) {
      if (chatID <= 0 || messageID === "") {
        throw new Error("Cannot link an invalid public chat or Discord ID.");
      }
      // The advisory lock also serializes simultaneous attempts to link one copy. A conflicting
      // tombstone is retained; the original row keeps its author.
      return await database.transaction(async (transaction) => {
        await transaction.execute(
          sql`SELECT pg_advisory_xact_lock(hashtextextended(${messageID}, 0))`,
        );
        const existing = await transaction
          .select({ deletedAt: chatLogTable.deletedAt, id: chatLogTable.id })
          .from(chatLogTable)
          .where(eq(chatLogTable.discordMessageID, messageID));
        const owner = existing[0];
        if (owner !== undefined && owner.id !== chatID) {
          if (owner.deletedAt === null) {
            throw new Error("Discord copy already belongs to a live message.");
          }
          const deleted = await transaction
            .update(chatLogTable)
            .set({ message: "", discordName: null, deletedAt: new Date() })
            .where(
              and(
                eq(chatLogTable.id, chatID),
                eq(chatLogTable.room, "lobby"),
                isNull(chatLogTable.deletedAt),
              ),
            )
            .returning({ id: chatLogTable.id });
          return deleted.length > 0;
        }
        await transaction
          .update(chatLogTable)
          .set({ discordMessageID: messageID })
          .where(
            and(
              eq(chatLogTable.id, chatID),
              eq(chatLogTable.room, "lobby"),
              isNull(chatLogTable.deletedAt),
            ),
          );
        return false;
      });
    },

    async getPublicDiscordMessage(chatID: number) {
      const rows = await database
        .select({
          chatID: chatLogTable.id,
          message: chatLogTable.message,
          source: chatLogTable.source,
          username: usersTable.username,
          discordMessageID: chatLogTable.discordMessageID,
        })
        .from(chatLogTable)
        .leftJoin(usersTable, eq(usersTable.id, chatLogTable.userID))
        .where(
          and(
            eq(chatLogTable.id, chatID),
            eq(chatLogTable.room, "lobby"),
            isNull(chatLogTable.deletedAt),
          ),
        );
      return rows[0];
    },
  };
}
