import type { Settings, UserID } from "@hanabi-live/data";
import type { NumPlayers } from "@hanabi-live/game";
import { eq, getTableColumns } from "drizzle-orm";
import { userSettingsTable, usersTable } from "../databaseSchema";
import { db } from "../db";

/** @see https://orm.drizzle.team/docs/goodies#get-typed-table-columns */
const USER_SETTINGS_COLUMNS = (() => {
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const { userID, ...settingsColumns } = getTableColumns(userSettingsTable);
  return settingsColumns;
})();

export const userSettings = {
  set: async (
    userID: UserID,
    name: keyof Settings,
    value: string | number | boolean,
  ): Promise<void> => {
    await db.transaction(async (tx) => {
      // The legacy settings table has no unique user constraint.
      const users = await tx
        .select({ id: usersTable.id })
        .from(usersTable)
        .where(eq(usersTable.id, userID))
        .for("update");
      if (users.length === 0) {
        throw new Error("Cannot update settings for a missing user.");
      }
      const existing = await tx
        .select({ userID: userSettingsTable.userID })
        .from(userSettingsTable)
        .where(eq(userSettingsTable.userID, userID))
        .limit(1);
      if (existing.length === 0) {
        await tx.insert(userSettingsTable).values({ userID });
      }
      await tx
        .update(userSettingsTable)
        .set({ [name]: value })
        .where(eq(userSettingsTable.userID, userID));
    });
  },

  get: async (userID: UserID): Promise<Settings | undefined> => {
    const rows = await db
      .select(USER_SETTINGS_COLUMNS)
      .from(userSettingsTable)
      .where(eq(userSettingsTable.userID, userID));

    const row = rows[0];
    if (row === undefined) {
      return;
    }

    // A type assertion is necessary since the `createTableMaxPlayers` field is a number.
    return row as Omit<typeof row, "createTableMaxPlayers"> & {
      createTableMaxPlayers: NumPlayers;
    };
  },
};
