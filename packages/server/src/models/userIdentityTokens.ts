import { and, eq } from "drizzle-orm";
import { userIdentityTokensTable, usersTable } from "../databaseSchema";
import { db } from "../db";

interface UserIdentityTokenRow {
  readonly userID: number;
  readonly tokenHash: string;
  readonly tokenLookupHash: string;
  readonly expiresAt: Date;
  readonly datetimeCreated: Date;
  readonly datetimeUpdated: Date;
}

interface UsernameByTokenLookupHashRow {
  readonly username: string;
  readonly tokenHash: string;
  readonly expiresAt: Date;
}

export const userIdentityTokens = {
  getByUserID: async (
    userID: number,
  ): Promise<UserIdentityTokenRow | undefined> => {
    const rows = await db
      .select({
        userID: userIdentityTokensTable.userID,
        tokenHash: userIdentityTokensTable.tokenHash,
        tokenLookupHash: userIdentityTokensTable.tokenLookupHash,
        expiresAt: userIdentityTokensTable.expiresAt,
        datetimeCreated: userIdentityTokensTable.datetimeCreated,
        datetimeUpdated: userIdentityTokensTable.datetimeUpdated,
      })
      .from(userIdentityTokensTable)
      .where(eq(userIdentityTokensTable.userID, userID))
      .limit(1);

    return rows[0];
  },

  upsert: async (
    userID: number,
    tokenHash: string,
    tokenLookupHash: string,
    expiresAt: Date,
  ): Promise<void> => {
    await db
      .insert(userIdentityTokensTable)
      .values({
        userID,
        tokenHash,
        tokenLookupHash,
        expiresAt,
      })
      .onConflictDoUpdate({
        target: userIdentityTokensTable.userID,
        set: {
          tokenHash,
          tokenLookupHash,
          expiresAt,
          datetimeUpdated: new Date(),
        },
      });
  },

  getUsernameByTokenLookupHash: async (
    tokenLookupHash: string,
  ): Promise<UsernameByTokenLookupHashRow | undefined> => {
    const rows = await db
      .select({
        username: usersTable.username,
        tokenHash: userIdentityTokensTable.tokenHash,
        expiresAt: userIdentityTokensTable.expiresAt,
      })
      .from(userIdentityTokensTable)
      .innerJoin(usersTable, eq(usersTable.id, userIdentityTokensTable.userID))
      .where(and(eq(userIdentityTokensTable.tokenLookupHash, tokenLookupHash)))
      .limit(1);

    return rows[0];
  },
};
