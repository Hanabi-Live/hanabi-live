import { PROJECT_NAME } from "@hanabi-live/data";
import { bannedIPsInit } from "./bannedIPs";
import { STARTING_GIT_COMMIT_SHA1 } from "./constants";
import { httpInit } from "./http";
import { logger } from "./logger";
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
  } catch (error) {
    logger.error(`Failed to connect to the PostgreSQL database: ${error}`);
    logger.info(
      'Did you already run the "install_database_schema.sh" script to set up the database?',
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
