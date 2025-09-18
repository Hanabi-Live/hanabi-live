// We cannot use the "complete-node" library since it does not support CommonJS. Instead we
// copy-paste the functions here.

import fs from "node:fs/promises";

/** Helper function to asynchronously check if the provided path exists and is a file. */
export async function isFile(filePath: string): Promise<boolean> {
  try {
    const stats = await fs.stat(filePath);
    return stats.isFile();
  } catch {
    return false;
  }
}

/**
 * Helper function to asynchronously read a file.
 *
 * This assumes that the file is a text file and uses an encoding of "utf8".
 */
export async function readFile(filePath: string): Promise<string> {
  try {
    return await fs.readFile(filePath, "utf8");
  } catch (error) {
    throw new Error(`Failed to read file: ${filePath}`, {
      cause: error,
    });
  }
}
