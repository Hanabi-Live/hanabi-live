import fs from "node:fs";
import path from "node:path";
import { REPO_ROOT } from "./constants";

const MOTD_PATH = path.join(REPO_ROOT, "motd.txt");

export async function getMessageOfTheDay(): Promise<string | undefined> {
  try {
    const fileContents = await fs.promises.readFile(MOTD_PATH, "utf8");
    return fileContents.trim();
  } catch {
    return undefined;
  }
}
