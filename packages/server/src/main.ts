import { PROJECT_NAME } from "@hanabi/data";
import dotenv from "dotenv";
import Fastify from "fastify";
import fs from "node:fs";
import path from "node:path";
import { databaseInit } from "./db";
import { recordCurrentGitCommitSHA1 } from "./git";
import { logger, setLoggerPretty } from "./logger";

const REPO_ROOT = path.join(__dirname, "..", "..", "..");
const ENV_PATH = path.join(REPO_ROOT, ".env");
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
  loadEnvironmentVariables();
  setupLogger();
  logWelcomeMessage();
  recordCurrentGitCommitSHA1();
  validateVersionTXT();
  await databaseInit();

  // eslint-disable-next-line new-cap
  const fastify = Fastify({
    logger,
  });

  fastify.get("/", async (_request, _reply) => "HI");

  await fastify.listen({
    port: 80,
  });
}

function loadEnvironmentVariables() {
  if (!fs.existsSync(ENV_PATH)) {
    throw new Error(
      `The "${ENV_PATH}" file does not exist. Did you run the "install_dependencies.sh" script before running the server? This file should automatically be created when running this script.`,
    );
  }

  dotenv.config();
}

function setupLogger() {
  const isDev = getIsDev();
  if (isDev) {
    setLoggerPretty();
  }
}

function getIsDev(): boolean {
  const domain = process.env["DOMAIN"];

  return (
    domain === undefined ||
    domain === "" ||
    domain === "localhost" ||
    domain === "127.0.0.1" ||
    domain.startsWith("192.168.") ||
    domain.startsWith("10.")
  );
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
