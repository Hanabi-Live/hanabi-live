import { getRandomArrayElement } from "isaacscript-common-ts";
import fs from "node:fs";
import path from "node:path";
import { REPO_ROOT } from "./constants";

const WORD_LIST_PATH = path.join(REPO_ROOT, "misc", "word_list.txt");

const WORDS: readonly string[] = fs
  .readFileSync(WORD_LIST_PATH, "utf8")
  .trim()
  .split("\n");

export function getRandomTableName(): string {
  return getRandomArrayElement(WORDS);
}
