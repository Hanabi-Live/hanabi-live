import type { UserID } from "@hanabi-live/data";
import { eq } from "drizzle-orm";
import { bannedIPsTable, mutedIPsTable, usersTable } from "../databaseSchema";
import { db } from "../db";
import { normalizeString } from "../utils";

interface ModerationResult {
  readonly userID: UserID;
  readonly username: string;
  readonly ip: string;
  readonly inserted: boolean;
}

export const moderation = {
  set: async (
    kind: "ban" | "mute",
    username: string,
  ): Promise<ModerationResult | undefined> =>
    await db.transaction(async (tx) => {
      const users = await tx
        .select({
          id: usersTable.id,
          username: usersTable.username,
          ip: usersTable.lastIP,
        })
        .from(usersTable)
        .where(eq(usersTable.normalizedUsername, normalizeString(username)))
        .for("update");
      const user = users[0];
      if (user === undefined) {
        return undefined;
      }
      const table = kind === "ban" ? bannedIPsTable : mutedIPsTable;
      const inserted = await tx
        .insert(table)
        .values({ userID: user.id, ip: user.ip })
        .onConflictDoNothing()
        .returning({ id: table.id });
      return {
        userID: user.id as UserID,
        username: user.username,
        ip: user.ip,
        inserted: inserted.length > 0,
      };
    }),
};
