import { eq } from "drizzle-orm";
import { bannedIPsTable } from "../databaseSchema";
import { db } from "../db";

export const bannedIPs = {
  /** @returns True if the IP is banned. */
  check: async (ip: string): Promise<boolean> => {
    const result = await db
      .select({
        id: bannedIPsTable.id,
      })
      .from(bannedIPsTable)
      .where(eq(bannedIPsTable.ip, ip));

    return result.length > 0;
  },
};
