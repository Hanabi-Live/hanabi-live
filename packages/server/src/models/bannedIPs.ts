import { eq } from "drizzle-orm";
import { bannedIPsTable } from "../databaseSchema";
import { db } from "../db";

export const bannedIPs = {
  check: async (ip: string): Promise<boolean> => {
    const rows = await db
      .select({
        ip: bannedIPsTable.ip,
      })
      .from(bannedIPsTable)
      .where(eq(bannedIPsTable.ip, ip))
      .limit(1);
    return rows.length > 0;
  },
};
