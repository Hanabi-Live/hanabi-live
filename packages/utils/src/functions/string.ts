import unidecode from "unidecode";

export function getNumConsecutiveDiacritics(string: string): number {
  // First, normalize with Normalization Form Canonical Decomposition (NFD) so that diacritics are
  // separated from other characters:
  // https://en.wikipedia.org/wiki/Unicode_equivalence
  const normalizedString = string.normalize("NFD");

  let numConsecutiveDiacritic = 0;
  let maxConsecutiveDiacritic = 0;

  for (const character of normalizedString) {
    if (hasDiacritic(character)) {
      numConsecutiveDiacritic++;
      if (numConsecutiveDiacritic > maxConsecutiveDiacritic) {
        maxConsecutiveDiacritic = numConsecutiveDiacritic;
      }
    } else {
      numConsecutiveDiacritic = 0;
    }
  }

  return maxConsecutiveDiacritic;
}

export function hasEmoji(string: string): boolean {
  return /\p{Extended_Pictographic}/u.test(string);
}

export function hasDiacritic(string: string): boolean {
  // First, normalize with Normalization Form Canonical Decomposition (NFD) so that diacritics are
  // separated from other characters:
  // https://en.wikipedia.org/wiki/Unicode_equivalence
  const normalizedString = string.normalize("NFD");

  return /\p{Diacritic}/u.test(normalizedString);
}

/** Helper function to transliterate the string to ASCII and lowercase it. */
export function normalizeString(string: string): string {
  const ascii = unidecode(string);
  return ascii.toLowerCase();
}

/** Helper function to trim a prefix from a string, if it exists. Returns the trimmed string. */
export function trimPrefix(string: string, prefix: string): string {
  if (!string.startsWith(prefix)) {
    return string;
  }

  return string.slice(prefix.length);
}

/** Helper function to trim a suffix from a string, if it exists. Returns the trimmed string. */
export function trimSuffix(string: string, prefix: string): string {
  if (!string.endsWith(prefix)) {
    return string;
  }

  const endCharacter = string.length - prefix.length;
  return string.slice(0, endCharacter);
}
