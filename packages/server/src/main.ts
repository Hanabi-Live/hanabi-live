import { PROJECT_NAME } from "@hanabi/data";
import { recordCurrentGitCommitSHA1 } from "./git";
import { httpInit } from "./http";
import { logger } from "./logger";
import { testDatabase } from "./models/db";

main().catch((error) => {
  throw new Error(`${PROJECT_NAME} server encountered an error: ${error}`);
});

async function main() {
  logWelcomeMessage();
  recordCurrentGitCommitSHA1();
  await testDatabase();
  await httpInit();
}

function logWelcomeMessage() {
  const startText = `| Starting ${PROJECT_NAME} |`;
  const borderText = `+${"-".repeat(startText.length - 2)}+`;
  logger.info(borderText);
  logger.info(startText);
  logger.info(borderText);
}
