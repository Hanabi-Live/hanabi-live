import dotenv from "dotenv";
import fs from "node:fs";
import path from "node:path";
import { z } from "zod";
import { REPO_ROOT } from "./constants";

const ENV_PATH = path.join(REPO_ROOT, ".env");

if (!fs.existsSync(ENV_PATH)) {
  console.error(
    `The "${ENV_PATH}" file does not exist. Did you run the "install_dependencies.sh" script before running the server? This file should automatically be created when running this script.`,
  );
  process.exit(1);
}

dotenv.config({
  path: ENV_PATH,
});

// Loading values from the ".env" file will result in non-filled-in values being empty strings.
// Since we want to Zod to populate default values, we first convert empty strings to `undefined`.
for (const [key, value] of Object.entries(process.env)) {
  if (value === "") {
    delete process.env[key]; // eslint-disable-line @typescript-eslint/no-dynamic-delete
  }
}

const envSchema = z.object({
  DOMAIN: z.string().min(1).default("localhost"),
  SESSION_SECRET: z.string().min(128),
  PORT: z.coerce.number().int().default(0), // We dynamically set 80 or 443 later on.
  LOCALHOST_PORT: z.coerce.number().int().default(8081),

  TLS_CERT_FILE: z.string().default(""),
  TLS_KEY_FILE: z.string().default(""),

  DB_HOST: z.string().min(1).default("localhost"),
  DB_PORT: z.coerce.number().int().default(5432),
  DB_USER: z.string().min(1).default("hanabiuser"),
  DB_PASSWORD: z.string().min(1).default("1234567890"),
  DB_NAME: z.string().min(1).default("hanabi"),
});

export const env = envSchema.parse(process.env);

export const IS_DEV =
  env.DOMAIN === "localhost" ||
  env.DOMAIN === "127.0.0.1" ||
  env.DOMAIN.startsWith("192.168.") ||
  env.DOMAIN.startsWith("10.");
