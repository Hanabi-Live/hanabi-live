import { bannedIPsTable } from "../databaseSchema";
import { db } from "../db";

export const bannedIPs = {
  getAll: async (): Promise<readonly string[]> => {
    const rows = await db
      .select({
        ip: bannedIPsTable.ip,
      })
      .from(bannedIPsTable);

    return rows.map((row) => row.ip);
  },
};
