// Checks that each emote list in "emotes.json" matches the images in its directory, and that the
// Twitch and BetterTTV directories hold exactly the global emotes of those services, each showing
// the same pixels as the PNG that the service serves. It exits with an error if any check fails.

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
const TIMEOUT_MS = 30_000;
const REPO_ROOT = path.resolve(import.meta.dirname, "..", "..", "..");
const EMOTES_DIR = path.join(REPO_ROOT, "public", "img", "emotes");
const EMOTE_EXTENSION = ".png";
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
] as const satisfies readonly Service[];

const specialEmotePaths: ReadonlyMap<string, string> = new Map(
  Object.entries(CHAT_SPECIAL_EMOTES),
);
const directoryFailures = await checkDirectories();
const serviceFailures = await Promise.all(
  SERVICES.map(async (service) => await checkService(service)),
);
const failures = [...directoryFailures, ...serviceFailures.flat()];

if (failures.length > 0) {
  for (const failure of failures) {
    console.error(failure);
  }
  console.error(`${failures.length} emote problem(s) found.`);
  process.exit(1);
}

console.log(
  "Every emote list matches its directory, and the Twitch and BetterTTV emotes match their global emotes.",
);

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
