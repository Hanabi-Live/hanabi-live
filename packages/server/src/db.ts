import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import * as databaseSchema from "./databaseSchema";
import { env } from "./env";

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
