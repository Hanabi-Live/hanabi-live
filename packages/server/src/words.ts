import { assertDefined, getRandomInt, repeat } from "complete-common";
import fs from "node:fs";
import path from "node:path";
import { REPO_ROOT } from "./constants";

const WORD_LIST_PATH = path.join(REPO_ROOT, "misc", "word_list.txt");

const NUM_WORDS_IN_TABLE_NAME = 3;

const WORDS = [
  ...new Set(fs.readFileSync(WORD_LIST_PATH, "utf8").trim().split("\n")),
] as const;

if (WORDS.length < NUM_WORDS_IN_TABLE_NAME) {
  throw new Error(
    "The table-name dictionary needs at least three distinct words.",
  );
}

export function getRandomTableName(): string {
  const words: string[] = [];
  const selected: number[] = [];

  repeat(NUM_WORDS_IN_TABLE_NAME, () => {
    // Map a rank among remaining words past the at-most-two selected indices.
    let index = getRandomInt(0, WORDS.length - selected.length - 1);
    for (const previous of selected) {
      if (index >= previous) {
        index++;
      }
    }
    const word = WORDS[index];
    assertDefined(word, "Missing sampled table-name word.");
    selected.push(index);
    selected.sort((left, right) => left - right);
    words.push(word);
  });

  return words.join(" ");
}
