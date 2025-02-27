// We cannot use the "complete-node" library since it does not support CommonJS. Instead we
// copy-paste the functions here.

import fs from "node:fs";

/** Helper function to synchronously check if the provided path exists and is a file. */
export function isFile(filePath: string): boolean {
  try {
    return fs.existsSync(filePath) && fs.statSync(filePath).isFile();
  } catch {
    return false;
  }
}

/**
 * Helper function to synchronously read a file.
 *
 * This assumes that the file is a text file and uses an encoding of "utf8".
 *
 * This will throw an error if the file cannot be read.
 */
export function readFile(filePath: string): string {
  let fileContents: string;

  try {
    fileContents = fs.readFileSync(filePath, "utf8");
  } catch (error) {
    throw new Error(`Failed to read text file "${filePath}": ${error}`);
  }

  return fileContents;
}
