import type { TableID, UserID } from "@hanabi/data";
import { Redis } from "ioredis";
import { IS_DEV } from "./env";
import type { Table } from "./interfaces/Table";
import { tableStringifyFunc } from "./interfaces/Table";
import { logger } from "./logger";

const REDIS_TABLES_KEY = "tables";
const DEFAULT_REDIS_PORT = 6379;

const redis = new Redis({
  lazyConnect: true,
  showFriendlyErrorStack: IS_DEV,
});

export async function redisInit(): Promise<void> {
  // We want to connect before attaching the error handler so that we can exit the program if there
  // is an initial error.
  await redis.connect((error) => {
    if (error !== null && error !== undefined) {
      logger.error(
        `Failed to connect to the Redis server. Is Redis installed and listening on port ${DEFAULT_REDIS_PORT} (the default port)? (Redis should be configured to not require any authentication, which is the default.)`,
      );
      process.exit(1);
    }
  });
}

/*
export async function getRedisTables(): Promise<Map<TableID, Table>> {
  const tablesHash = await redis.hgetall(REDIS_TABLES_KEY);

  const tables = new Map<TableID, Table>();

  // We want to avoid converting the object values to an array, so we iterate with the `in`
  // operator.
  for (for tableIDString in tablesHash) {
    // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
    const tableJSON = tablesHash[tableIDString]!;
    const tableID = parseIntSafe(tableIDString) as TableID;
    const table = JSON.parse(tableJSON) as Table;

    tables.set(tableID, table);
  }

  return tables;
}
*/

export async function getRedisTablesWithUser(
  userID: UserID,
): Promise<readonly Table[]> {
  const tablesHash = await redis.hgetall(REDIS_TABLES_KEY);

  const tables: Table[] = [];

  // We want to avoid converting the object values to an array, so we iterate with the `in`
  // operator.
  // eslint-disable-next-line isaacscript/no-for-in
  for (const tableIDString in tablesHash) {
    // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
    const tableJSON = tablesHash[tableIDString]!;
    const table = JSON.parse(tableJSON) as Table;
    for (const player of table.players) {
      if (player.userID === userID) {
        tables.push(table);
      }
    }
  }

  return tables;
}

export async function getRedisTable(
  tableID: TableID,
): Promise<Table | undefined> {
  const jsonString = await redis.hget(REDIS_TABLES_KEY, tableID.toString());
  if (jsonString === null) {
    return undefined;
  }

  return JSON.parse(jsonString) as Table;
}

export async function setRedisTable(table: Table): Promise<void> {
  const tableJSON = tableStringifyFunc(table);
  await redis.hset(REDIS_TABLES_KEY, table.id, tableJSON);
}

/*
export async function deleteRedisTable(tableID: TableID): Promise<void> {
  await redis.hdel(REDIS_TABLES_KEY, tableID.toString());
}
*/
