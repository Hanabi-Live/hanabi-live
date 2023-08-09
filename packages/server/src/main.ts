import { fatalError } from "@hanabi/utils";
import dotenv from "dotenv";
import Fastify from "fastify";
import fs from "node:fs";
import path from "node:path";
import { log } from "./log";

const REPO_ROOT = path.join(__dirname, "..", "..", "..");
const ENV_PATH = path.join(REPO_ROOT, ".env");

main().catch((error) => {
  throw new Error(`The Hanabi server encountered an error: ${error}`);
});

async function main() {
  loadEnvironmentVariables();

  const isDev = getIsDev();
  log.info(`LOLL: ${isDev}`, isDev, "123");

  // eslint-disable-next-line new-cap
  const fastify = Fastify({
    logger: true,
  });

  // Declare a route
  fastify.get("/", async (_request, _reply) => "HI");

  await fastify.listen({ port: 80 });
}

function loadEnvironmentVariables() {
  if (!fs.existsSync(ENV_PATH)) {
    fatalError(
      `The "${ENV_PATH}" file does not exist. Did you run the "install_dependencies.sh" script before running the server? This file should automatically be created when running this script.`,
    );
  }

  dotenv.config();
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
