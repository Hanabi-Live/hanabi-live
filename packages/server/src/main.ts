import { PROJECT_NAME } from "@hanabi-live/data";
import {
  activeGameCount,
  announceServer,
  clearPregames,
  terminateActiveGames,
} from "./administration";
import { classifyChatMessage, executeChatCommand } from "./chatCommands";
import { sendServerChat } from "./chatPublish";
import { incomingCommands } from "./commandAdmission";
import { STARTING_GIT_COMMIT_SHA1 } from "./constants";
import { createDatabaseClient, db } from "./db";
import { initializeDiscord } from "./discordRuntime";
import { IS_DEV } from "./env";
import { initializeErrorReporting } from "./errorReporting";
import { initializeGameRuntime } from "./gameRuntime";
import { createGameStore } from "./gameStore";
import { httpInit } from "./http";
import { httpOperationsInit } from "./http/httpOperations";
import { shutdownServer } from "./lifecycle";
import { logger } from "./logger";
import { verifyDatabaseMigrations } from "./migrations";
import { models } from "./models";
import { prepareRestart, replaceProcess } from "./restart";
import { initializeShutdown } from "./shutdown";
import { getStartedTimestamp } from "./uptime";

// We do not bother writing a catch block since it does not display errors correctly when there is
// an aggregate error.
// eslint-disable-next-line @typescript-eslint/no-floating-promises
main();

async function main() {
  logWelcomeMessage();
  logger.info(`Starting Git commit SHA1: ${STARTING_GIT_COMMIT_SHA1}`);
  const closeErrorReporting = await initializeErrorReporting(
    IS_DEV,
    process.env["SENTRY_DSN"],
    STARTING_GIT_COMMIT_SHA1,
  );
  if ((process.env["GA_TRACKING_ID"] ?? "") !== "") {
    logger.warn(
      "GA_TRACKING_ID targets retired Universal Analytics and is not used by the TypeScript server.",
    );
  }

  const runtime = await startGameRuntime();
  const discord = initializeDiscord({
    classifyCommand: classifyChatMessage,
    command: async (message) => {
      await executeChatCommand(undefined, message.text, "lobby");
    },
  });
  const control = initializeShutdown({
    activeGames: activeGameCount,
    clearPregames,
    terminateGames: terminateActiveGames,
    notice: announceServer,
    prepareRestart,
    async stop(restart) {
      logger.info("Draining the server for shutdown.");
      await shutdownServer(runtime, transports, async () => {
        await db.$client.end({ timeout: 30 });
      });
      if (!(await closeErrorReporting())) {
        logger.warn(
          "Sentry reports did not finish before shutdown; consult local logs.",
        );
      }
      if (restart) {
        logger.info(
          "Replacing the Node process with the current compiled server.",
        );
        try {
          replaceProcess();
        } catch (error) {
          process.exitCode = 1;
          throw error;
        }
      }
      process.off("SIGTERM", requestShutdown);
      process.off("SIGINT", requestShutdown);
      logger.info("The server successfully shut down.");
      process.exitCode = 0;
    },
  });
  const operations = await httpOperationsInit();
  const server = await httpInit().catch(async (error: unknown) => {
    await operations.close().catch((cleanupError: unknown) => {
      logger.error(
        `Failed to close startup operations listener: ${String(cleanupError)}`,
      );
    });
    throw error;
  });
  const transports = {
    websocketServer: server.websocketServer,
    async close() {
      await Promise.all([server.close(), operations.close(), discord.close()]);
    },
  };
  control.activate();
  function requestShutdown() {
    if (control.busy) {
      return;
    }
    control.stop(false).catch((error: unknown) => {
      logger.error(
        `Shutdown failed; commands remain paused. Repair the failure and retry the signal: ${String(error)}`,
      );
    });
  }
  process.on("SIGTERM", requestShutdown);
  process.on("SIGINT", requestShutdown);
  const started = `The server has successfully started at: ${getStartedTimestamp()} (${STARTING_GIT_COMMIT_SHA1})`;
  logger.info(started);
  discord
    .start()
    .then(async () => {
      if (discord.status === "ready") {
        await incomingCommands.run(async () => {
          await sendServerChat(started, "lobby", true);
        });
      }
    })
    .catch(() => {
      logger.error(
        "Discord startup announcement failed; inspect integration status.",
      );
    });
}

async function startGameRuntime() {
  try {
    await models.chatLog.testDatabase();
    await verifyDatabaseMigrations();
    return await initializeGameRuntime(
      createGameStore(createDatabaseClient("recovery"), db.$client),
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
