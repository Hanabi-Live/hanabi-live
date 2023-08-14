import { PROJECT_NAME } from "@hanabi/data";
import fs from "node:fs";
import path from "node:path";
import { REPO_ROOT } from "./constants";
import { recordCurrentGitCommitSHA1 } from "./git";
import { httpInit } from "./http";
import { logger } from "./logger";
import { testDatabase } from "./models/db";

const VERSION_TXT_PATH = path.join(
  REPO_ROOT,
  "public",
  "js",
  "bundles",
  "version.txt",
);

main().catch((error) => {
  throw new Error(`${PROJECT_NAME} server encountered an error: ${error}`);
});

async function main() {
  logWelcomeMessage();
  recordCurrentGitCommitSHA1();
  validateVersionTXT();
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

function validateVersionTXT() {
  if (!fs.existsSync(VERSION_TXT_PATH)) {
    throw new Error(
      `The "${VERSION_TXT_PATH}" file does not exist. Did you run the "build_client.sh" script before running the server? This file should automatically be created when running this script.`,
    );
  }
}
