import type { UserID } from "@hanabi-live/data";
import { userID as userIDSchema } from "@hanabi-live/data";
import { eq, sql } from "drizzle-orm";
import {
  mutedIPsTable,
  userFriendsTable,
  userSettingsTable,
  usersTable,
} from "../databaseSchema";
import { db } from "../db";

interface DatabaseUser {
  readonly id: UserID;
  readonly username: string;
  readonly passwordHash: string | null;
  readonly oldPasswordHash: string | null;
}

interface WSData {
  readonly username: string;
  readonly normalizedUsername: string;
  readonly hyphenated: boolean;
  readonly friends: Set<UserID>;
  readonly muted: boolean;
}

const friendIDsSchema = userIDSchema.array();

function prepareWSDataQuery(database: typeof db) {
  return database
    .select({
      username: usersTable.username,
      normalizedUsername: usersTable.normalizedUsername,
      hyphenated: sql<boolean>`COALESCE(${userSettingsTable.hyphenatedConventions}, false)`,
      friends: sql`
        (
          SELECT COALESCE(jsonb_agg(${userFriendsTable.friendID}), '[]'::jsonb)
          FROM ${userFriendsTable} WHERE ${userFriendsTable.userID} = ${usersTable.id}
        )
      `.mapWith((value: unknown) => friendIDsSchema.parse(value)),
      muted: sql<boolean>`
        EXISTS (
          SELECT 1 FROM ${mutedIPsTable} WHERE ${mutedIPsTable.ip} = ${sql.placeholder("ip")}
        )
      `,
    })
    .from(usersTable)
    .leftJoin(userSettingsTable, eq(userSettingsTable.userID, usersTable.id))
    .where(eq(usersTable.id, sql.placeholder("id")))
    .limit(1)
    .prepare("websocket_user_metadata");
}

const wsDataQueries = new WeakMap<
  typeof db,
  ReturnType<typeof prepareWSDataQuery>
>();

export const users = {
  create: async (
    username: string,
    normalizedUsername: string,
    passwordHash: string,
    lastIP: string,
  ): Promise<DatabaseUser | undefined> => {
    const rows = await db
      .insert(usersTable)
      .values({
        username,
        normalizedUsername,
        passwordHash,
        lastIP,
      })
      .returning();

    const row = rows[0];
    if (row === undefined) {
      return undefined;
    }

    // A type assertion is necessary since we are branding the user ID.
    return row as Omit<typeof row, "id"> & { id: UserID };
  },

  get: async (username: string): Promise<DatabaseUser | undefined> => {
    const rows = await db
      .select({
        id: usersTable.id,
        username: usersTable.username,
        passwordHash: usersTable.passwordHash,
        oldPasswordHash: usersTable.oldPasswordHash,
      })
      .from(usersTable)
      .where(eq(usersTable.username, username));

    const row = rows[0];
    if (row === undefined) {
      return undefined;
    }

    // A type assertion is necessary since we are branding the user ID.
    return row as Omit<typeof row, "id"> & { id: UserID };
  },

  getUsername: async (userID: number): Promise<string | undefined> => {
    const rows = await db
      .select({
        username: usersTable.username,
      })
      .from(usersTable)
      .where(eq(usersTable.id, userID))
      .limit(1);

    return rows[0]?.username;
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

    const user = rows[0];
    if (user === undefined) {
      return undefined;
    }

    return user.username;
  },

  /** @returns The user's ID and their username with its original capitalization. */
  getByNormalizedUsername: async (
    normalizedUsername: string,
  ): Promise<{ id: UserID; username: string } | undefined> => {
    const rows = await db
      .select({ id: usersTable.id, username: usersTable.username })
      .from(usersTable)
      .where(eq(usersTable.normalizedUsername, normalizedUsername))
      .limit(1);
    const row = rows[0];
    return row === undefined
      ? undefined
      : { id: row.id as UserID, username: row.username };
  },

  getIDByNormalizedUsername: async (
    normalizedUsername: string,
  ): Promise<UserID | undefined> => {
    const rows = await db
      .select({ id: usersTable.id })
      .from(usersTable)
      .where(eq(usersTable.normalizedUsername, normalizedUsername))
      .limit(1);
    const row = rows[0];
    return row === undefined ? undefined : (row.id as UserID);
  },

  /** Get a user's WebSocket connection metadata that will be stored alongside their connection. */
  getWSData: async (
    userID: number,
    ip: string,
  ): Promise<WSData | undefined> => {
    let query = wsDataQueries.get(db);
    if (query === undefined) {
      query = prepareWSDataQuery(db);
      wsDataQueries.set(db, query);
    }
    const [row] = await query.execute({ id: userID, ip });
    if (row === undefined) {
      return undefined;
    }
    return {
      ...row,
      friends: new Set(row.friends),
    };
  },

  getDatetimeCreated: async (userID: UserID): Promise<Date | undefined> => {
    const rows = await db
      .select({
        datetimeCreated: usersTable.datetimeCreated,
      })
      .from(usersTable)
      .where(eq(usersTable.id, userID));

    const row = rows[0];
    if (row === undefined) {
      return undefined;
    }

    return row.datetimeCreated;
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
        oldPasswordHash: null, // eslint-disable-line unicorn/no-null
      })
      .where(eq(usersTable.id, userID));
  },
};
