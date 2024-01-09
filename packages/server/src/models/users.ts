import type { UserID } from "@hanabi/data";
import { eq, sql } from "drizzle-orm";
import {
  mutedIPsTable,
  userSettingsTable,
  usersTable,
} from "../databaseSchema";
import { db } from "../db";

interface DatabaseUser {
  readonly id: UserID;
  readonly username: string;
  readonly passwordHash: string;
}

interface WSData {
  readonly username: string;
  readonly normalizedUsername: string;
  readonly hyphenated: boolean;
  /// readonly friends: readonly string[];
  /// readonly reverseFriends: readonly string[];
  readonly muted: boolean;
}

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

    const hyphenatedRows = await db
      .select({
        hyphenatedConventions: userSettingsTable.hyphenatedConventions,
      })
      .from(userSettingsTable)
      .where(eq(userSettingsTable.userID, userID));

    const hyphenatedRow = hyphenatedRows[0];
    const hyphenated =
      hyphenatedRow !== undefined && hyphenatedRow.hyphenatedConventions;

    /*
    const friendsRows = await db
      .select({
        username: usersTable.username,
      })
      .from(userFriendsTable)
      .innerJoin(usersTable, eq(userFriendsTable.friendID, usersTable.id))
      .where(eq(userFriendsTable.userID, userID));

    const friends = friendsRows.map((friendsRow) => friendsRow.username);

    const reverseFriendsRows = await db
      .select({
        username: usersTable.username,
      })
      .from(userReverseFriendsTable)
      .innerJoin(
        usersTable,
        eq(userReverseFriendsTable.friendID, usersTable.id),
      )
      .where(eq(userReverseFriendsTable.userID, userID));

    const reverseFriends = reverseFriendsRows.map(
      (reverseFriendsRow) => reverseFriendsRow.username,
    );
    */

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
      /// friends,
      /// reverseFriends,
      hyphenated,
      muted,
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
      })
      .where(eq(usersTable.id, userID));
  },
};
