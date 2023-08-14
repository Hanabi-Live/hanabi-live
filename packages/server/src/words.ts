import fs from "node:fs";
import path from "node:path";
import { REPO_ROOT } from "./constants";

const WORD_LIST_PATH = path.join(REPO_ROOT, "misc", "word_list.txt");

// TODO: export
// eslint-disable-next-line @typescript-eslint/no-unused-vars
const WORDS: readonly string[] = fs
  .readFileSync(WORD_LIST_PATH, "utf8")
  .trim()
  .split("\n");
