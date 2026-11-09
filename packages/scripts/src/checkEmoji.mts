// Checks that each emote list in "emotes.json" matches the images in its directory, and that every
// global BetterTTV emote is present and shows the same pixels as the PNG that BetterTTV serves. It
// exits with an error if any check fails.

import { CHAT_COLON_EMOTES, CHAT_EMOTES } from "@hanabi-live/data";
import type { DecodedPng } from "fast-png";
import { convertIndexedToRgb, decode } from "fast-png";
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
const RGBA_CHANNELS = 4;
const SUPPORTED_BIT_DEPTH = 8;
const OPAQUE_ALPHA = 255;

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
  if (!samePixels(local, remote)) {
    return `${code}: "${relativePath}" differs from ${imageURL}.`;
  }

  return undefined;
}

/**
 * The CDN's image optimization (Cloudflare Polish) recompresses PNGs, strips their metadata, and
 * clears the color of fully transparent pixels, and edge servers can serve either the original or
 * the optimized copy. Thus, images are compared by what they show rather than by their bytes.
 */
function samePixels(a: Uint8Array, b: Uint8Array): boolean {
  const imageA = decode(a);
  const imageB = decode(b);
  if (imageA.width !== imageB.width || imageA.height !== imageB.height) {
    return false;
  }

  const pixelsA = toRGBA(imageA);
  const pixelsB = toRGBA(imageB);
  for (let i = 0; i < pixelsA.length; i += RGBA_CHANNELS) {
    const alpha = pixelsA[i + RGBA_CHANNELS - 1];
    if (alpha !== pixelsB[i + RGBA_CHANNELS - 1]) {
      return false;
    }
    if (alpha === 0) {
      continue;
    }
    for (let channel = 0; channel < RGBA_CHANNELS - 1; channel++) {
      if (pixelsA[i + channel] !== pixelsB[i + channel]) {
        return false;
      }
    }
  }

  return true;
}

function toRGBA(image: DecodedPng): Uint8Array {
  const { palette } = image;
  if (
    palette === undefined
    && (image.depth !== SUPPORTED_BIT_DEPTH || image.transparency !== undefined)
  ) {
    throw new Error(
      `Only ${SUPPORTED_BIT_DEPTH}-bit PNGs without a transparent color key are supported.`,
    );
  }
  const [data, channels] =
    palette === undefined
      ? [image.data, image.channels]
      : [convertIndexedToRgb(image), palette[0]?.length ?? RGBA_CHANNELS];

  const hasAlpha = channels % 2 === 0;
  const colorChannels = hasAlpha ? channels - 1 : channels;
  const pixelCount = image.width * image.height;
  const rgba = new Uint8Array(pixelCount * RGBA_CHANNELS);
  for (let pixel = 0; pixel < pixelCount; pixel++) {
    const source = pixel * channels;
    const target = pixel * RGBA_CHANNELS;
    for (let channel = 0; channel < RGBA_CHANNELS - 1; channel++) {
      // Grayscale images repeat their one color channel.
      rgba[target + channel] =
        data[source + (colorChannels === 1 ? 0 : channel)] ?? 0;
    }
    rgba[target + RGBA_CHANNELS - 1] = hasAlpha
      ? (data[source + colorChannels] ?? 0)
      : OPAQUE_ALPHA;
  }

  return rgba;
}
