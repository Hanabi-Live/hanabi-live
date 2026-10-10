import unidecode from "unidecode";

const MAX_TAG_LENGTH = 100;
const NON_SPACE_WHITESPACE =
  /[\t\n\v\f\r\u{85}\u{A0}\u{1680}\u{2000}-\u{200A}\u{2028}\u{2029}\u{202F}\u{205F}\u{3000}]/gu;

type SanitizedTag =
  { tag: string; error?: never } | { tag?: never; error: string };

/** Mirrors the validation and normalization performed by Go's sanitizeTag. */
export function sanitizeTag(tag: string): SanitizedTag {
  if (Buffer.byteLength(tag, "utf8") > MAX_TAG_LENGTH) {
    return { error: "Tags cannot be longer than 100 characters." };
  }

  for (const character of tag) {
    const codePoint = character.codePointAt(0) ?? 0;
    if (codePoint >= 0xd8_00 && codePoint <= 0xdf_ff) {
      return { error: "Tags must contain valid UTF8 characters." };
    }
  }

  const whitespaceNormalized = tag.replaceAll(NON_SPACE_WHITESPACE, " ");
  const trimmed = whitespaceNormalized.replaceAll(/^ +|(?<! ) +$/gu, "");
  if (trimmed === "") {
    return { error: "Tags cannot be blank." };
  }

  return { tag: unidecode(trimmed).toLowerCase() };
}
