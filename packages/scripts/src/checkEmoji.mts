// Checks that each emote list in "emotes.json" matches the images in its directory, and that every
// global BetterTTV emote is present and byte-for-byte the PNG that BetterTTV serves. It exits with
// an error if any check fails.

import { CHAT_COLON_EMOTES, CHAT_EMOTES } from "@hanabi-live/data";
import { readdir } from "node:fs/promises";
import path from "node:path";

const GLOBAL_EMOTES_URL = "https://api.betterttv.net/3/cached/emotes/global";
const TIMEOUT_MS = 30_000;
const REPO_ROOT = path.resolve(import.meta.dirname, "..", "..", "..");
const EMOTES_DIR = path.join(REPO_ROOT, "public", "img", "emotes");
const BETTERTTV_CATEGORY = "betterttv";
const EMOTE_EXTENSION = ".png";
/** Holds emotes that chat matches separately, such as "<3", so it has no list. */
const UNLISTED_DIRECTORY = "other";

interface BetterTTVEmote {
  readonly id: string;
  readonly code: string;
  /** Modifiers change other emotes rather than appearing on their own. */
  readonly modifier: boolean;
}

const colonEmotes: ReadonlyMap<string, string> = new Map(
  Object.entries(CHAT_COLON_EMOTES),
);
const directoryFailures = await checkDirectories();
const betterTTVEmotes = await fetchGlobalEmotes();
const betterTTVFailures = await Promise.all(
  betterTTVEmotes
    .filter((emote) => !emote.modifier)
    .map(async (emote) => await checkBetterTTVEmote(emote)),
);
const failures = [...directoryFailures, ...betterTTVFailures].filter(
  (failure) => failure !== undefined,
);

if (failures.length > 0) {
  for (const failure of failures) {
    console.error(failure);
  }
  console.error(`${failures.length} emote problem(s) found.`);
  process.exit(1);
}

console.log(
  "Every emote list matches its directory, and every global BetterTTV emote is present and up to date.",
);

/** Checks that each list in "emotes.json" has exactly the images in its directory. */
async function checkDirectories(): Promise<readonly string[]> {
  const categories: ReadonlySet<string> = new Set(Object.keys(CHAT_EMOTES));
  const entries = await readdir(EMOTES_DIR, { withFileTypes: true });
  const unlistedDirectoryFailures = entries
    .filter(
      (entry) =>
        entry.isDirectory()
        && entry.name !== UNLISTED_DIRECTORY
        && !categories.has(entry.name),
    )
    .map((entry) => `"${entry.name}" has no emote list in "emotes.json".`);
  const categoryFailures = await Promise.all(
    Object.entries(CHAT_EMOTES).map(
      async ([category, emotes]) => await checkCategory(category, emotes),
    ),
  );

  return [...unlistedDirectoryFailures, ...categoryFailures.flat()];
}

async function checkCategory(
  category: string,
  emotes: readonly string[],
): Promise<readonly string[]> {
  const problems: string[] = [];
  const expected = new Set(emotes);
  if (category === BETTERTTV_CATEGORY) {
    for (const fileName of colonEmotes.values()) {
      expected.add(fileName);
    }
  }

  const files = await readdir(path.join(EMOTES_DIR, category));
  const present = new Set<string>();
  for (const file of files) {
    if (!file.endsWith(EMOTE_EXTENSION)) {
      problems.push(
        `"${category}/${file}" is not a "${EMOTE_EXTENSION}" file.`,
      );
      continue;
    }
    const name = file.slice(0, -EMOTE_EXTENSION.length);
    present.add(name);
    if (!expected.has(name)) {
      problems.push(
        `"${category}/${file}" is not in the "${category}" list in "emotes.json".`,
      );
    }
  }
  for (const name of expected) {
    if (!present.has(name)) {
      problems.push(
        `"${name}" is in the "${category}" list in "emotes.json", but "${category}/${name}${EMOTE_EXTENSION}" is missing.`,
      );
    }
  }

  return problems;
}

async function fetchGlobalEmotes(): Promise<readonly BetterTTVEmote[]> {
  const response = await fetchOK(GLOBAL_EMOTES_URL);
  return (await response.json()) as BetterTTVEmote[];
}

async function fetchOK(url: string): Promise<Response> {
  const response = await fetch(url, {
    signal: AbortSignal.timeout(TIMEOUT_MS),
  });
  if (!response.ok) {
    throw new Error(`${url} returned HTTP ${response.status}.`);
  }
  return response;
}

async function checkBetterTTVEmote(
  emote: BetterTTVEmote,
): Promise<string | undefined> {
  const { code } = emote;
  const colonEmoteFileName = colonEmotes.get(code);
  if (
    colonEmoteFileName === undefined
    && !CHAT_EMOTES[BETTERTTV_CATEGORY].includes(code)
  ) {
    return `${code}: missing from the "${BETTERTTV_CATEGORY}" list in "emotes.json".`;
  }
  const relativePath = path.join(
    BETTERTTV_CATEGORY,
    `${colonEmoteFileName ?? code}${EMOTE_EXTENSION}`,
  );

  const file = Bun.file(path.join(EMOTES_DIR, relativePath));
  if (!(await file.exists())) {
    return `${code}: missing "${relativePath}".`;
  }

  // Without an extension, the CDN chooses the format from the request's "Accept" header.
  const imageURL = `https://cdn.betterttv.net/emote/${emote.id}/1x.png`;
  const response = await fetchOK(imageURL);
  const [local, remote] = await Promise.all([file.bytes(), response.bytes()]);
  if (!Buffer.from(local).equals(remote)) {
    return `${code}: "${relativePath}" differs from ${imageURL}.`;
  }

  return undefined;
}
