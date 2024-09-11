import { getRandomArrayElement, repeat } from "complete-common";
import fs from "node:fs";
import path from "node:path";
import { REPO_ROOT } from "./constants";

const WORD_LIST_PATH = path.join(REPO_ROOT, "misc", "word_list.txt");

const NUM_WORDS_IN_TABLE_NAME = 3;

const WORDS: readonly string[] = fs
  .readFileSync(WORD_LIST_PATH, "utf8")
  .trim()
  .split("\n");

export function getRandomTableName(): string {
  const words: string[] = [];

  repeat(NUM_WORDS_IN_TABLE_NAME, () => {
    const word = getRandomArrayElement(WORDS, words);
    words.push(word);
  });

  return words.join(" ");
}
