import { PROJECT_NAME } from "@hanabi-live/data";
import { STARTING_GIT_COMMIT_SHA1 } from "./constants";
import { createDatabaseClient, db } from "./db";
import { IS_DEV } from "./env";
import { initializeGameRuntime } from "./gameRuntime";
import { createGameStore } from "./gameStore";
import { httpInit } from "./http";
import { shutdownServer } from "./lifecycle";
import { logger } from "./logger";
import { verifyDatabaseMigrations } from "./migrations";
import { models } from "./models";

// We do not bother writing a catch block since it does not display errors correctly when there is
// an aggregate error.
// eslint-disable-next-line @typescript-eslint/no-floating-promises
main();

async function main() {
  logWelcomeMessage();
  logger.info(`Starting Git commit SHA1: ${STARTING_GIT_COMMIT_SHA1}`);

  const runtime = await startGameRuntime();
  const server = await httpInit();
  let stopping: Promise<void> | undefined;
  function requestShutdown() {
    if (stopping !== undefined) {
      return;
    }
    logger.info("Draining the server for shutdown.");
    stopping = shutdownServer(runtime, server, async () => {
      await db.$client.end({ timeout: 30 });
    })
      .then(() => {
        process.off("SIGTERM", requestShutdown);
        process.off("SIGINT", requestShutdown);
        logger.info("The server successfully shut down.");
        process.exitCode = 0;
      })
      .catch((error: unknown) => {
        logger.error(
          `Shutdown failed; commands remain paused. Repair the failure and retry the signal: ${String(error)}`,
        );
      })
      .finally(() => {
        stopping = undefined;
      });
  }
  process.on("SIGTERM", requestShutdown);
  process.on("SIGINT", requestShutdown);
}

async function startGameRuntime() {
  try {
    await models.chatLog.testDatabase();
    await verifyDatabaseMigrations();
    return await initializeGameRuntime(
      createGameStore(createDatabaseClient(2), db.$client),
      {
        development: IS_DEV,
        getBlockedSeeds: async (users) =>
          await models.userLinkages.getBlockedSeeds(users),
        getCompletionHistory: async (id) => await models.games.getHistory([id]),
      },
    );
  } catch (error) {
    logger.error(`Failed database startup checks: ${error}`);
    logger.info(
      "Verify database initialization and apply pending migrations. Do not reinitialize an existing production database.",
    );
    process.exit(1);
  }
}

function logWelcomeMessage() {
  const startText = `| Starting ${PROJECT_NAME} |`;
  const borderText = `+${"-".repeat(startText.length - 2)}+`;
  logger.info(borderText);
  logger.info(startText);
  logger.info(borderText);
}
