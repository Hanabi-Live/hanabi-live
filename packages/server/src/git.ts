import { execSync } from "node:child_process";
import { logger } from "./logger";

let gitCommitSHA1 = "unknown";

/**
 * Record the commit that corresponds with when the server was started. (This is useful to know what
 * version of the server is running, since it is possible to update the client without restarting
 * the server.)
 */
export function recordCurrentGitCommitSHA1(): void {
  gitCommitSHA1 = execSync("git rev-parse HEAD").toString().trim();
  logger.info(`Current git commit SHA1: ${gitCommitSHA1}`, 123);
}

/*
export function getStartingGitCommitSHA1(): string {
  return gitCommitSHA1;
}
*/
