/* eslint-disable complete/require-ascii */

import unidecode from "unidecode";

/**
 * Helper function to transliterate the string to ASCII, lowercase it, and remove leading/trailing
 * whitespace.
 *
 * This is useful to ensure that similar usernames cannot be created to impersonate other users
 * (like e.g. Alice and Alicè).
 */
export function normalizeUsername(string: string): string {
  return normalizeString(string).trim();
}

/** Transliterate a string to ASCII and lowercase it without trimming whitespace. */
export function normalizeString(string: string): string {
  return unidecode(string).toLowerCase();
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
