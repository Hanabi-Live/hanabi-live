import { describe, expect, test } from "@jest/globals";
import { readFileSync } from "node:fs";
import path from "node:path";
import { z } from "zod";
import {
  hasUsernameEmoji,
  normalizeString,
  normalizeUsername,
  trimUnicodeWhitespace,
} from "./utils";

const filename = path.resolve(
  __dirname,
  "../../../server/src/testdata/username_protocol.json",
);
const corpus = z
  .array(
    z.object({
      input: z.string(),
      normalized: z.string(),
      hasEmoji: z.boolean().default(false),
    }),
  )
  .parse(JSON.parse(readFileSync(filename, "utf8")));

describe("username normalization", () => {
  test("normalizeString transliterates and lowercases without trimming", () => {
    expect(normalizeString("\u{E8}")).toBe("e");
    expect(normalizeString(" ALICE ")).toBe(" alice ");
  });

  test("normalizeUsername trims the normalized username", () => {
    expect(normalizeUsername(" ALICE ")).toBe("alice");
  });

  test.each(corpus)(
    "preserves the Go identity for %j",
    ({ input, normalized, hasEmoji }) => {
      expect(normalizeUsername(input)).toBe(normalized);
      expect(hasUsernameEmoji(trimUnicodeWhitespace(input))).toBe(hasEmoji);
    },
  );

  test("trims Go whitespace without treating a BOM as whitespace", () => {
    expect(trimUnicodeWhitespace("\u{85} Alice \u{85}")).toBe("Alice");
    expect(trimUnicodeWhitespace("\u{FEFF}Alice\u{FEFF}")).toBe(
      "\u{FEFF}Alice\u{FEFF}",
    );
    expect(trimUnicodeWhitespace(`${" ".repeat(100_000)}Alice`)).toBe("Alice");
  });
});
