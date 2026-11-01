import { PROJECT_NAME } from "@hanabi-live/data";
import { bannedIPsInit } from "./bannedIPs";
import { STARTING_GIT_COMMIT_SHA1 } from "./constants";
import { httpInit } from "./http";
import { logger } from "./logger";
import { verifyDatabaseMigrations } from "./migrations";
import { models } from "./models";
import { redisInit } from "./redis";

// We do not bother writing a catch block since it does not display errors correctly when there is
// an aggregate error.
// eslint-disable-next-line @typescript-eslint/no-floating-promises
main();

async function main() {
  logWelcomeMessage();
  logger.info(`Starting Git commit SHA1: ${STARTING_GIT_COMMIT_SHA1}`);

  try {
    await models.chatLog.testDatabase();
    await verifyDatabaseMigrations();
  } catch (error) {
    logger.error(`Failed database startup checks: ${error}`);
    logger.info(
      "Verify database initialization and apply pending migrations. Do not reinitialize an existing production database.",
    );
    process.exit(1);
  }

  await bannedIPsInit();
  await redisInit();
  await httpInit();
}

function logWelcomeMessage() {
  const startText = `| Starting ${PROJECT_NAME} |`;
  const borderText = `+${"-".repeat(startText.length - 2)}+`;
  logger.info(borderText);
  logger.info(startText);
  logger.info(borderText);
}
