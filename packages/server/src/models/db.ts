import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import { chatLogTable } from "../databaseSchema";
import { env } from "../env";

const client = postgres({
  host: env.DB_HOST,
  port: env.DB_PORT,
  user: env.DB_USER,
  password: env.DB_PASSWORD,
  database: env.DB_NAME,
});
const db = drizzle(client);

export async function testDatabase(): Promise<void> {
  const chatLogs = await db
    .select({
      message: chatLogTable.message,
    })
    .from(chatLogTable)
    .limit(1);
  const chatLog = chatLogs[0];

  if (chatLog === undefined || chatLog.message === "") {
    throw new Error(
      'Failed to retrieve the a chat log message from the database when testing to see if the database is operational. Did you already run the "install_database_schema.sh" script to set up the database?',
    );
  }
}
