/* eslint-disable complete/require-ascii */

import { assertDefined } from "complete-common";
import normalization from "./json/goIdentity.json";

const NORMALIZATION_PAGES: Readonly<Record<string, readonly string[]>> =
  normalization.pages;
const USERNAME_EMOJI = new RegExp(normalization.usernameEmojiPattern, "u");

export function hasUsernameEmoji(string: string): boolean {
  return USERNAME_EMOJI.test(string);
}

/**
 * Helper function to transliterate the string to ASCII, lowercase it, and remove leading/trailing
 * whitespace.
 *
 * This is useful to ensure that similar usernames cannot be created to impersonate other users
 * (like e.g. Alice and Alicè).
 */
export function normalizeUsername(string: string): string {
  return normalizeString(trimUnicodeWhitespace(string));
}

export function trimUnicodeWhitespace(string: string): string {
  const whitespace = /\p{White_Space}/u;
  let start = -1;
  let end = 0;
  let offset = 0;
  for (const character of string) {
    if (!whitespace.test(character)) {
      if (start === -1) {
        start = offset;
      }
      end = offset + character.length;
    }
    offset += character.length;
  }
  return start === -1 ? "" : string.slice(start, end);
}

/** Transliterate a string to ASCII and lowercase it without trimming whitespace. */
export function normalizeString(string: string): string {
  let result = "";
  for (const character of string.toWellFormed()) {
    const codePoint = character.codePointAt(0);
    assertDefined(codePoint, "Missing Unicode code point.");
    if (codePoint < 0x7f) {
      result += character;
    } else if (codePoint <= 0xe_ff_ff) {
      // Unmapped characters are dropped by Go's pinned transliteration library.
      result +=
        NORMALIZATION_PAGES[Math.floor(codePoint / 256)]?.[codePoint % 256]
        ?? "";
    }
  }
  return result.toLowerCase();
}

export function sortUsernames(names: readonly string[]): readonly string[] {
  return names.toSorted((first, second) =>
    Buffer.compare(
      Buffer.from(first.toLowerCase()),
      Buffer.from(second.toLowerCase()),
    ),
  );
}

/** Match Go's UTF-8 byte limit without splitting a character. */
export function truncateToMaxBytes(string: string, maxBytes: number): string {
  let bytes = 0;
  let result = "";
  for (const character of string.toWellFormed()) {
    bytes += Buffer.byteLength(character);
    if (bytes > maxBytes) {
      break;
    }
    result += character;
  }
  return result;
}

export function getMaxConsecutiveMarks(string: string): number {
  let current = 0;
  let maximum = 0;
  for (const character of string.normalize("NFD")) {
    current = /\p{Mn}/u.test(character) ? current + 1 : 0;
    maximum = Math.max(maximum, current);
  }
  return maximum;
}
