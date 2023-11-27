import { eq } from "drizzle-orm";
import { usersTable } from "../databaseSchema";
import { db } from "../db";

export type User = NonNullable<Awaited<ReturnType<typeof users.get>>>;

export const users = {
  // eslint-disable-next-line @typescript-eslint/explicit-module-boundary-types
  create: async (
    username: string,
    normalizedUsername: string,
    passwordHash: string,
    lastIP: string,
  ) => {
    const rows = await db
      .insert(usersTable)
      .values({
        username,
        normalizedUsername,
        passwordHash,
        lastIP,
      })
      .returning();

    return rows[0];
  },

  // eslint-disable-next-line @typescript-eslint/explicit-module-boundary-types
  get: async (username: string) => {
    const rows = await db
      .select({
        id: usersTable.id,
        username: usersTable.username,
        passwordHash: usersTable.passwordHash,
      })
      .from(usersTable)
      .where(eq(usersTable.username, username));

    return rows[0];
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
};
