// Checks that every global BetterTTV emote is in the chat's emote list and that its image is
// byte-for-byte the PNG that BetterTTV serves. It exits with an error if an emote is missing or its
// image differs.

import { CHAT_EMOTES } from "@hanabi-live/data";
import path from "node:path";

const GLOBAL_EMOTES_URL = "https://api.betterttv.net/3/cached/emotes/global";
const TIMEOUT_MS = 30_000;
const REPO_ROOT = path.resolve(import.meta.dirname, "..", "..", "..");
const EMOTES_DIR = path.join(REPO_ROOT, "public", "img", "emotes");
const CATEGORY = "betterttv";

/** Emotes whose codes chat cannot match by name, so they are stored elsewhere or not at all. */
const SPECIAL_EMOTES: ReadonlyMap<string, string | undefined> = new Map([
  // Chat turns text between colons into an emoji.
  [":tf:", undefined],
  // Chat replaces this code itself, since it does not end at a word boundary.
  ["D:", path.join("other", "D.png")],
]);

interface BetterTTVEmote {
  readonly id: string;
  readonly code: string;
  /** Modifiers change other emotes rather than appearing on their own. */
  readonly modifier: boolean;
}

const betterTTVEmotes = await fetchGlobalEmotes();
const listedEmotes: ReadonlySet<string> = new Set(CHAT_EMOTES[CATEGORY]);
const problems = await Promise.all(
  betterTTVEmotes
    .filter((emote) => !emote.modifier)
    .map(async (emote) => await checkEmote(emote)),
);
const failures = problems.filter((problem) => problem !== undefined);

if (failures.length > 0) {
  for (const failure of failures) {
    console.error(failure);
  }
  console.error(
    `${failures.length} BetterTTV emote(s) are missing or out of date.`,
  );
  process.exit(1);
}

console.log("Every global BetterTTV emote is present and up to date.");

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

async function checkEmote(emote: BetterTTVEmote): Promise<string | undefined> {
  const { code } = emote;
  let relativePath: string;
  if (SPECIAL_EMOTES.has(code)) {
    const specialPath = SPECIAL_EMOTES.get(code);
    if (specialPath === undefined) {
      return undefined;
    }
    relativePath = specialPath;
  } else {
    if (!listedEmotes.has(code)) {
      return `${code}: missing from the "${CATEGORY}" list in "emotes.json".`;
    }
    relativePath = path.join(CATEGORY, `${code}.png`);
  }

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
