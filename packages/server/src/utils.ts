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
  const ascii = unidecode(string);
  return ascii.toLowerCase().trim();
}

/**
 * Helper function to truncate a string to a maximum length (in UTF-16 code units) without splitting
 * a character in half.
 *
 * A plain `slice` can cut a two-code-unit character (like an emoji) in the middle of its surrogate
 * pair, leaving a lone surrogate that renders as "�".
 */
export function truncateToMaxCodeUnits(
  string: string,
  maxLength: number,
): string {
  if (string.length <= maxLength) {
    return string;
  }

  const truncated = string.slice(0, maxLength);
  return truncated.isWellFormed() ? truncated : truncated.slice(0, -1);
}
