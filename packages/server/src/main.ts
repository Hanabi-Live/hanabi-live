import { PROJECT_NAME } from "@hanabi/data";
import { STARTING_GIT_COMMIT_SHA1 } from "./constants";
import { httpInit } from "./http";
import { logger } from "./logger";
import { models } from "./models";

main().catch((error) => {
  throw new Error(`${PROJECT_NAME} server encountered an error: ${error}`);
});

async function main() {
  logWelcomeMessage();
  logger.info(`Starting Git commit SHA1: ${STARTING_GIT_COMMIT_SHA1}`, 123);

  await models.chatLog.testDatabase();
  await httpInit();
}

function logWelcomeMessage() {
  const startText = `| Starting ${PROJECT_NAME} |`;
  const borderText = `+${"-".repeat(startText.length - 2)}+`;
  logger.info(borderText);
  logger.info(startText);
  logger.info(borderText);
}
