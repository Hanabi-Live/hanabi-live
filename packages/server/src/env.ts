import { createEnv } from "@t3-oss/env-core";
import dotenv from "dotenv";
import fs from "node:fs";
import path from "node:path";
import { z } from "zod";
import { REPO_ROOT } from "./constants";

const ENV_PATH = path.join(REPO_ROOT, ".env");

if (!fs.existsSync(ENV_PATH)) {
  throw new Error(
    `The "${ENV_PATH}" file does not exist. Did you run the "install_dependencies.sh" script before running the server? This file should automatically be created when running this script.`,
  );
}

dotenv.config({
  path: ENV_PATH,
});

// TODO: https://github.com/t3-oss/t3-env/issues/109
for (const [key, value] of Object.entries(process.env)) {
  if (value === "") {
    delete process.env[key]; // eslint-disable-line @typescript-eslint/no-dynamic-delete
  }
}

export const env = createEnv({
  server: {
    DOMAIN: z.string().default("localhost"),
    SESSION_SECRET: z.string(),
    PORT: z.number().default(0), // We dynamically set 80 or 443 later on.
    LOCALHOST_PORT: z.number().default(8081),

    TLS_CERT_FILE: z.string().default(""),
    TLS_KEY_FILE: z.string().default(""),

    DB_HOST: z.string().default("localhost"),
    DB_PORT: z.number().default(5432),
    DB_USER: z.string().default("hanabiuser"),
    DB_PASSWORD: z.string().default("1234567890"),
    DB_NAME: z.string().default("hanabi"),
  },

  runtimeEnv: process.env,
});

export const IS_DEV =
  env.DOMAIN === "localhost" ||
  env.DOMAIN === "127.0.0.1" ||
  env.DOMAIN.startsWith("192.168.") ||
  env.DOMAIN.startsWith("10.");
