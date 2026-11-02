// cspell:words datname
import { assertDefined } from "complete-common";
import { drizzle } from "drizzle-orm/postgres-js";
import { randomUUID } from "node:crypto";
import postgres from "postgres";
import * as databaseSchema from "./databaseSchema";
import { env } from "./env";

const DATABASE_TIMEOUT_SECONDS = 30;
const instanceID = randomUUID();
const POOLS = {
  primary: { max: 10, name: `hanabi-ts-${instanceID}-primary` },
  recovery: { max: 2, name: `hanabi-ts-${instanceID}-recovery` },
} as const;
type PoolRole = keyof typeof POOLS;
interface PoolReport {
  readonly maxConnections: number;
  readonly totalConnections: number;
  readonly activeConnections: number;
  readonly idleConnections: number;
  readonly idleTransactionConnections: number;
}

/**
 * The database object is lazy such that it will not actually be connect to the database until the
 * first query is performed:
 * https://github.com/porsager/postgres?tab=readme-ov-file#the-connection-pool
 */
export function createDatabaseClient(role: PoolRole): postgres.Sql {
  const pool = POOLS[role];
  return postgres({
    host: env.DB_HOST,
    port: env.DB_PORT,
    user: env.DB_USER,
    password: env.DB_PASSWORD,
    database: env.DB_NAME,
    max: pool.max,
    connect_timeout: DATABASE_TIMEOUT_SECONDS,
    connection: {
      application_name: pool.name,
      statement_timeout: DATABASE_TIMEOUT_SECONDS * 1000,
      idle_in_transaction_session_timeout: DATABASE_TIMEOUT_SECONDS * 1000,
    },
  });
}

const client = createDatabaseClient("primary");

export const db = drizzle(client, {
  schema: databaseSchema,
});

export async function getDatabasePoolReports(): Promise<
  Readonly<Record<PoolRole, PoolReport>>
> {
  const rows = await client<
    Array<{
      role: PoolRole;
      totalConnections: number;
      activeConnections: number;
      idleConnections: number;
      idleTransactionConnections: number;
    }>
  >`
    SELECT pools.role,
      COUNT(activity.pid)::integer AS "totalConnections",
      (COUNT(*) FILTER (WHERE activity.state = 'active'))::integer AS "activeConnections",
      (COUNT(*) FILTER (WHERE activity.state = 'idle'))::integer AS "idleConnections",
      (COUNT(*) FILTER (WHERE activity.state LIKE 'idle in transaction%'))::integer AS "idleTransactionConnections"
    FROM (VALUES
      ('primary', ${POOLS.primary.name}),
      ('recovery', ${POOLS.recovery.name})
    ) AS pools(role, name)
    LEFT JOIN pg_stat_activity activity
      ON activity.application_name = pools.name AND activity.datname = current_database()
    GROUP BY pools.role
  `;
  function report(role: PoolRole) {
    const row = rows.find((entry) => entry.role === role);
    assertDefined(row, `Missing ${role} database pool report.`);
    return {
      maxConnections: POOLS[role].max,
      totalConnections: row.totalConnections,
      activeConnections: row.activeConnections,
      idleConnections: row.idleConnections,
      idleTransactionConnections: row.idleTransactionConnections,
    };
  }
  return { primary: report("primary"), recovery: report("recovery") };
}
