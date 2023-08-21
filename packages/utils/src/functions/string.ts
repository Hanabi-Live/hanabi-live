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
