// Checks that each group in "emojis.json", and "emotes.json", are in alphabetical order, that no
// emoji name is in two groups, that each emote list in "emotes.json" matches the images in its
// directory, and that the Twitch, BetterTTV, and FrankerFaceZ directories hold exactly the global
// emotes of those services, each showing the same pixels as the PNG that the service serves. It
// exits with an error if any check fails.

import { CHAT_EMOTES, CHAT_SPECIAL_EMOTES } from "@hanabi-live/data";
import type { DecodedPng } from "fast-png";
import { convertIndexedToRgb, decode } from "fast-png";
import { readdir } from "node:fs/promises";
import path from "node:path";

const BETTERTTV_GLOBAL_EMOTES_URL =
  "https://api.betterttv.net/3/cached/emotes/global";
/** Twitch's own API requires OAuth credentials, so this uses a public mirror of it. */
const TWITCH_GLOBAL_EMOTES_URL =
  "https://emotes.adamcy.pl/v1/global/emotes/twitch";
const FRANKERFACEZ_GLOBAL_EMOTES_URL =
  "https://api.frankerfacez.com/v1/set/global";
const TIMEOUT_MS = 30_000;
const REPO_ROOT = path.resolve(import.meta.dirname, "..", "..", "..");
const EMOTES_DIR = path.join(REPO_ROOT, "public", "img", "emotes");
const EMOTE_EXTENSION = ".png";
const JSON_DIR = path.join(REPO_ROOT, "packages", "data", "src", "json");
const EMOJIS_JSON_PATH = path.join(JSON_DIR, "emojis.json");
const EMOTES_JSON_PATH = path.join(JSON_DIR, "emotes.json");
/** A key of the root object, which Prettier indents by two spaces. */
const ROOT_KEY = /^ {2}("(?:[^"\\]|\\.)*"):/gmu;
/** A key of an object in the root object, which Prettier indents by four spaces. */
const NESTED_KEY = /^ {4}("(?:[^"\\]|\\.)*"):/gmu;
/** Chat matches emotes at word boundaries, so it cannot match other codes (such as ":)"). */
const MATCHABLE_CODE = /^\w+$/u;
const RGBA_CHANNELS = 4;
const SUPPORTED_BIT_DEPTH = 8;
const OPAQUE_ALPHA = 255;

interface UpstreamEmote {
  readonly code: string;
  readonly imageURL: string;
}

interface Service {
  readonly name: string;
  readonly category: keyof typeof CHAT_EMOTES;
  readonly fetchGlobalEmotes: () => Promise<readonly UpstreamEmote[]>;
}

interface BetterTTVEmote {
  readonly id: string;
  readonly code: string;
  /** Modifiers change other emotes rather than appearing on their own. */
  readonly modifier: boolean;
}

interface FrankerFaceZResponse {
  /** The sets that every user has; the others belong to particular users. */
  readonly default_sets: readonly number[];
  readonly sets: Readonly<Record<string, FrankerFaceZSet>>;
}

interface FrankerFaceZSet {
  readonly emoticons: readonly FrankerFaceZEmote[];
}

interface FrankerFaceZEmote {
  readonly name: string;
  /** Modifiers change other emotes rather than appearing on their own. */
  readonly modifier: boolean;
  /** Maps each scale to an image URL. */
  readonly urls: Readonly<Record<string, string>>;
}

interface MirrorEmote {
  readonly code: string;
  readonly urls: ReadonlyArray<{ readonly size: string; readonly url: string }>;
}

const SERVICES = [
  {
    name: "BetterTTV",
    category: "betterttv",
    fetchGlobalEmotes: fetchBetterTTVEmotes,
  },
  {
    name: "Twitch",
    category: "twitch",
    fetchGlobalEmotes: fetchTwitchEmotes,
  },
  {
    name: "FrankerFaceZ",
    category: "frankerfacez",
    fetchGlobalEmotes: fetchFrankerFaceZEmotes,
  },
] as const satisfies readonly Service[];

const specialEmotePaths: ReadonlyMap<string, string> = new Map(
  Object.entries(CHAT_SPECIAL_EMOTES),
);
const emojiGroups = await readEmojiGroups();
const emojiNames = [...emojiGroups.values()].flat();
const orderFailures = [
  ...[...emojiGroups].map(([group, names]) =>
    checkAlphabetical(`The "${group}" group in "emojis.json"`, names),
  ),
  emojiNames.length === new Set(emojiNames).size
    ? undefined
    : 'An emoji name is in more than one group in "emojis.json".',
  checkAlphabetical(
    'The keys of "emotes.json"',
    await readRootKeys(EMOTES_JSON_PATH),
  ),
  ...Object.entries(CHAT_EMOTES).map(([category, emotes]) =>
    checkAlphabetical(`The "${category}" list in "emotes.json"`, emotes),
  ),
].filter((failure) => failure !== undefined);
const directoryFailures = await checkDirectories();
const serviceFailures = await Promise.all(
  SERVICES.map(async (service) => await checkService(service)),
);
const failures = [
  ...orderFailures,
  ...directoryFailures,
  ...serviceFailures.flat(),
];

if (failures.length > 0) {
  for (const failure of failures) {
    console.error(failure);
  }
  console.error(`${failures.length} emote problem(s) found.`);
  process.exit(1);
}

console.log(
  "The emoji and emotes are in alphabetical order, no emoji is in two groups, every emote list matches its directory, and the Twitch, BetterTTV, and FrankerFaceZ emotes match their global emotes.",
);

/**
 * Checks that names are in case-insensitive alphabetical order, with names that differ only in case
 * in code point order, and that none repeat.
 */
function checkAlphabetical(
  description: string,
  names: readonly string[],
): string | undefined {
  for (const [i, name] of names.entries()) {
    const previous = names[i - 1];
    if (previous !== undefined && compareAlphabetically(previous, name) >= 0) {
      return `${description} must be in alphabetical order, but "${previous}" is before "${name}".`;
    }
  }

  return undefined;
}

/**
 * Reads the keys of a JSON file's root object in the order of the file. (A parsed object lists
 * integer-like keys, such as "100", first.)
 */
async function readRootKeys(filePath: string): Promise<readonly string[]> {
  const text = await Bun.file(filePath).text();
  const keys = Array.from(text.matchAll(ROOT_KEY), (match) => {
    const key: unknown = JSON.parse(match[1] ?? "");
    if (typeof key !== "string") {
      throw new TypeError(`Failed to parse a key in "${filePath}".`);
    }
    return key;
  });
  const parsed = JSON.parse(text) as object;
  if (keys.length !== Object.keys(parsed).length) {
    throw new Error(`Failed to find every root key in "${filePath}".`);
  }

  return keys;
}

/** Reads the emoji names of each group in "emojis.json", in the order of the file. */
async function readEmojiGroups(): Promise<
  ReadonlyMap<string, readonly string[]>
> {
  const text = await Bun.file(EMOJIS_JSON_PATH).text();
  const groupKeys = await readRootKeys(EMOJIS_JSON_PATH);
  const groupTexts = text
    .split(ROOT_KEY)
    .filter((_part, i) => i % 2 === 0)
    .slice(1);
  if (groupTexts.length !== groupKeys.length) {
    throw new Error(`Failed to find every group in "${EMOJIS_JSON_PATH}".`);
  }

  return new Map(
    groupKeys.map((group, i) => [
      group,
      Array.from((groupTexts[i] ?? "").matchAll(NESTED_KEY), (match) =>
        String(JSON.parse(match[1] ?? "")),
      ),
    ]),
  );
}

function compareAlphabetically(a: string, b: string): number {
  const caseInsensitive = compareCodePoints(a.toLowerCase(), b.toLowerCase());
  return caseInsensitive === 0 ? compareCodePoints(a, b) : caseInsensitive;
}

function compareCodePoints(a: string, b: string): number {
  if (a < b) {
    return -1;
  }
  return a > b ? 1 : 0;
}

/** Checks that each list in "emotes.json" has exactly the images in its directory. */
async function checkDirectories(): Promise<readonly string[]> {
  const categories: ReadonlySet<string> = new Set(Object.keys(CHAT_EMOTES));
  const entries = await readdir(EMOTES_DIR, { withFileTypes: true });
  const unlistedDirectoryFailures = entries
    .filter((entry) => entry.isDirectory() && !categories.has(entry.name))
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
  for (const emotePath of specialEmotePaths.values()) {
    if (path.posix.dirname(emotePath) === category) {
      expected.add(path.posix.basename(emotePath));
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
      problems.push(`"${category}/${name}${EMOTE_EXTENSION}" is missing.`);
    }
  }

  return problems;
}

async function fetchBetterTTVEmotes(): Promise<readonly UpstreamEmote[]> {
  const response = await fetchOK(BETTERTTV_GLOBAL_EMOTES_URL);
  const emotes = (await response.json()) as BetterTTVEmote[];
  return emotes
    .filter((emote) => !emote.modifier)
    .map((emote) => ({
      code: emote.code,
      // Without an extension, the CDN chooses the format from the request's "Accept" header.
      imageURL: `https://cdn.betterttv.net/emote/${emote.id}/1x.png`,
    }));
}

async function fetchFrankerFaceZEmotes(): Promise<readonly UpstreamEmote[]> {
  const response = await fetchOK(FRANKERFACEZ_GLOBAL_EMOTES_URL);
  const { default_sets: defaultSets, sets } =
    (await response.json()) as FrankerFaceZResponse;
  return defaultSets
    .flatMap((setID) => sets[setID]?.emoticons ?? [])
    .filter((emote) => !emote.modifier)
    .map((emote) => {
      const imageURL = emote.urls["1"];
      if (imageURL === undefined) {
        throw new Error(
          `The FrankerFaceZ emote "${emote.name}" has no 1x image.`,
        );
      }
      return { code: emote.name, imageURL };
    });
}

async function fetchTwitchEmotes(): Promise<readonly UpstreamEmote[]> {
  const response = await fetchOK(TWITCH_GLOBAL_EMOTES_URL);
  const emotes = (await response.json()) as MirrorEmote[];
  return emotes.map((emote) => {
    const url = emote.urls.find((candidate) => candidate.size === "1x")?.url;
    if (url === undefined) {
      throw new Error(`The Twitch emote "${emote.code}" has no 1x image.`);
    }
    // The "default" variant of an animated emote is a GIF; the "static" variant is always a PNG.
    return { code: emote.code, imageURL: url.replace("/default/", "/static/") };
  });
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

/**
 * Checks that a service's directory has every global emote that chat can match, no emotes that are
 * not global, and the same images as the service.
 */
async function checkService(service: Service): Promise<readonly string[]> {
  const { name, category } = service;
  const upstreamEmotes = await service.fetchGlobalEmotes();

  // Some codes are listed more than once with different images; any of them is accepted.
  const imageURLs = new Map<string, string[]>();
  for (const { code, imageURL } of upstreamEmotes) {
    const urls = imageURLs.get(code) ?? [];
    urls.push(imageURL);
    imageURLs.set(code, urls);
  }

  // Map each local emote code to its image path in the emote directory.
  const localEmotes = new Map<string, string>();
  for (const code of CHAT_EMOTES[category]) {
    localEmotes.set(code, `${category}/${code}`);
  }
  for (const [code, emotePath] of specialEmotePaths) {
    if (path.posix.dirname(emotePath) === category) {
      localEmotes.set(code, emotePath);
    }
  }

  const problems: string[] = [];
  for (const [code, emotePath] of localEmotes) {
    if (!imageURLs.has(code)) {
      problems.push(
        `"${emotePath}${EMOTE_EXTENSION}" is not a global ${name} emote ("${code}"), so it should be removed.`,
      );
    }
  }
  for (const code of imageURLs.keys()) {
    if (
      !localEmotes.has(code)
      && (MATCHABLE_CODE.test(code) || specialEmotePaths.has(code))
    ) {
      problems.push(
        `The global ${name} emote "${code}" is missing from the "${category}" list in "emotes.json".`,
      );
    }
  }

  const imageProblems = await Promise.all(
    [...localEmotes].map(async ([code, emotePath]) => {
      const urls = imageURLs.get(code);
      return urls === undefined
        ? undefined
        : await checkImage(code, emotePath, urls);
    }),
  );

  return [
    ...problems,
    ...imageProblems.filter((problem) => problem !== undefined),
  ];
}

async function checkImage(
  code: string,
  emotePath: string,
  urls: readonly string[],
): Promise<string | undefined> {
  const relativePath = `${emotePath}${EMOTE_EXTENSION}`;
  const file = Bun.file(path.join(EMOTES_DIR, relativePath));
  if (!(await file.exists())) {
    // "checkDirectories" reports the missing file.
    return undefined;
  }

  const local = await file.bytes();
  const remotes = await Promise.all(
    urls.map(async (url) => {
      const response = await fetchOK(url);
      return await response.bytes();
    }),
  );
  if (remotes.every((remote) => !samePixels(local, remote))) {
    return `"${relativePath}" differs from the image of "${code}" at ${urls.join(" or ")}.`;
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
