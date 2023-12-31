import { eq, sql } from "drizzle-orm";
import { mutedIPsTable, usersTable } from "../databaseSchema";
import { db } from "../db";
import type { UserID } from "../types/UserID";

interface User {
  id: UserID;
  username: string;
  passwordHash: string;
}

interface WSData {
  username: string;
  normalizedUsername: string;
  muted: boolean;
}

export const users = {
  create: async (
    username: string,
    normalizedUsername: string,
    passwordHash: string,
    lastIP: string,
  ): Promise<User | undefined> => {
    const rows = await db
      .insert(usersTable)
      .values({
        username,
        normalizedUsername,
        passwordHash,
        lastIP,
      })
      .returning();

    // A type assertion is necessary since we are branding the user ID.
    const user = rows[0] as User | undefined;

    return user;
  },

  get: async (username: string): Promise<User | undefined> => {
    const rows = await db
      .select({
        id: usersTable.id,
        username: usersTable.username,
        passwordHash: usersTable.passwordHash,
      })
      .from(usersTable)
      .where(eq(usersTable.username, username));

    // A type assertion is necessary since we are branding the user ID.
    const user = rows[0] as User | undefined;

    return user;
  },

  getSimilarUsername: async (
    normalizedUsername: string,
  ): Promise<string | undefined> => {
    const rows = await db
      .select({
        username: usersTable.username,
      })
      .from(usersTable)
      .where(eq(usersTable.normalizedUsername, normalizedUsername));

    return rows[0]?.username;
  },

  /** Get a user's WebSocket connection metadata that will be stored alongside their connection. */
  getWSData: async (
    userID: number,
    ip: string,
  ): Promise<WSData | undefined> => {
    // TODO: Rewrite this function to do one database call once we can do multi-select with Drizzle:
    // https://github.com/drizzle-team/drizzle-orm/pull/1405

    const usernameRows = await db
      .select({
        username: usersTable.username,
        normalizedUsername: usersTable.normalizedUsername,
      })
      .from(usersTable)
      .where(eq(usersTable.id, userID));

    const usernameRow = usernameRows[0];
    if (usernameRow === undefined) {
      return undefined;
    }
    const { username, normalizedUsername } = usernameRow;

    const mutedRows = await db
      .select({
        id: mutedIPsTable.id,
      })
      .from(mutedIPsTable)
      .where(eq(mutedIPsTable.ip, ip));

    const muted = mutedRows.length > 0;

    return {
      username,
      normalizedUsername,
      muted,
    };
  },

  setLastLogin: async (userID: number, ip: string): Promise<void> => {
    await db
      .update(usersTable)
      .set({
        datetimeLastLogin: sql`NOW()`,
        lastIP: ip,
      })
      .where(eq(usersTable.id, userID));
  },

  setPassword: async (userID: number, passwordHash: string): Promise<void> => {
    await db
      .update(usersTable)
      .set({
        passwordHash,
      })
      .where(eq(usersTable.id, userID));
  },
};
