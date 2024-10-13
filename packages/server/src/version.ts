import { parseIntSafe } from "complete-common";
import fs from "node:fs";
import path from "node:path";
import { REPO_ROOT } from "./constants";

/** This is used when getting the version fails in some way. */
const DEFAULT_VERSION = 0;

const VERSION_TXT_PATH = path.join(
  REPO_ROOT,
  "public",
  "js",
  "bundles",
  "version.txt",
);

if (!fs.existsSync(VERSION_TXT_PATH)) {
  throw new Error(
    `The "${VERSION_TXT_PATH}" file does not exist. Did you run the "build_client.sh" script before running the server? This file should automatically be created when running this script.`,
  );
}

/**
 * Get the current version of the JavaScript client, which is contained in the "version.txt" file.
 * We want to read this file every time (as opposed to just reading it on server start) so that we
 * can update the client without having to restart the entire server.
 */
export function getClientVersion(): number {
  let version: string;
  try {
    version = fs.readFileSync(VERSION_TXT_PATH, "utf8");
  } catch {
    return DEFAULT_VERSION;
  }

  return parseIntSafe(version) ?? DEFAULT_VERSION;
}
