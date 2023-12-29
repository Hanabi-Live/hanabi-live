import { eq, sql } from "drizzle-orm";
import { usersTable } from "../databaseSchema";
import { db } from "../db";
import type { UserID } from "../types/UserID";

interface User {
  id: UserID;
  username: string;
  passwordHash: string;
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

  getUsername: async (userID: number): Promise<string | undefined> => {
    const rows = await db
      .select({
        username: usersTable.username,
      })
      .from(usersTable)
      .where(eq(usersTable.id, userID));

    return rows[0]?.username;
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
