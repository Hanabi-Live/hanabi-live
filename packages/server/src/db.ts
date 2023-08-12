import { parseIntSafe } from "@hanabi/utils";
import { Client } from "pg";
import { logger } from "./logger";

export async function databaseInit(): Promise<void> {
  const client = new Client({});
  await client.connect();

  const res = await client.query("SELECT $1::text as message", [
    "Hello world!",
  ]);
  console.log(res.rows[0].message); // Hello world!
  await client.end();
}

/**
 * Read the database configuration from environment variables. (They should already be loaded from
 * the ".env" file at this point.)
 */
function getDatabaseConfig() {
  let host = process.env["DB_HOST"];
  if (host === undefined || host === "") {
    host = "localhost";
    logger.info(`DB_HOST not specified; using a default value of: ${host}`);
  }

  const portString = process.env["DB_PORT"];
  let port: number;
  if (portString === undefined || portString === "") {
    port = 5432; // The default port for PostgreSQL.
    logger.info(`DB_PORT not specified; using a default value of: ${port}`);
  } else {
    port = parseIntSafe(portString);
    if (Number.isNaN(port)) {
      throw new TypeError(
        `Failed to parse the "DB_PORT" environment variable: ${portString}`,
      );
    }
  }

  let user = process.env["DB_USER"];
  if (user === undefined || user === "") {
    user = "hanabiuser";
    logger.info(`DB_USER not specified; using a default value of: ${user}`);
  }

  let password = process.env["DB_PASSWORD"];
  if (password === undefined || password === "") {
    password = "1234567890";
    logger.info(
      `DB_PASSWORD not specified; using a default value of: ${password}`,
    );
  }

  /*

	dbName = os.Getenv("DB_NAME")
	if len(dbPass) == 0 {
		defaultName := "hanabi"
		logger.Info("DB_NAME not specified; using default value of \"" + defaultName + "\".")
		dbName = defaultName
	}

  */

  return {
    host,
    port,
  };
}
