import { execSync } from "node:child_process";
import path from "node:path";

export const REPO_ROOT = path.resolve(__dirname, "..", "..", "..");

/**
 * The Git commit that corresponds with when the server was started. (This is useful to know what
 * version of the server is running, since it is possible to update the client without restarting
 * the server.)
 */
export const STARTING_GIT_COMMIT_SHA1 = execSync("git rev-parse HEAD", {
  cwd: REPO_ROOT,
})
  .toString()
  .trim();

export const NUM_CONSECUTIVE_DIACRITICS_ALLOWED = 3;
