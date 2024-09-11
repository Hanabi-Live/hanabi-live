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
