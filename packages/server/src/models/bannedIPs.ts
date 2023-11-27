import { eq } from "drizzle-orm";
import { bannedIPsTable } from "../databaseSchema";
import { db } from "../db";

export const bannedIPs = {
  /** @returns True if the IP is banned. */
  check: async (ip: string): Promise<boolean> => {
    const rows = await db
      .select({
        id: bannedIPsTable.id,
      })
      .from(bannedIPsTable)
      .where(eq(bannedIPsTable.ip, ip));

    return rows.length > 0;
  },
};
