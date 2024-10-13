import type { Settings, UserID } from "@hanabi-live/data";
import type { NumPlayers } from "@hanabi-live/game";
import { eq, getTableColumns } from "drizzle-orm";
import { userSettingsTable } from "../databaseSchema";
import { db } from "../db";

/** @see https://orm.drizzle.team/docs/goodies#get-typed-table-columns */
const USER_SETTINGS_COLUMNS = (() => {
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const { userID, ...settingsColumns } = getTableColumns(userSettingsTable);
  return settingsColumns;
})();

export const userSettings = {
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
