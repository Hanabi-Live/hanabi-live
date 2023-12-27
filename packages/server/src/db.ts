import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import * as databaseSchema from "./databaseSchema";
import { env } from "./env";

/**
 * The database object is lazy such that it will not actually be connect to the database until the
 * first query is performed:
 * https://github.com/porsager/postgres?tab=readme-ov-file#the-connection-pool
 */
const client = postgres({
  host: env.DB_HOST,
  port: env.DB_PORT,
  user: env.DB_USER,
  password: env.DB_PASSWORD,
  database: env.DB_NAME,
});

export const db = drizzle(client, {
  schema: databaseSchema,
});
