import { describe, expect, test } from "@jest/globals";
import { normalizeString, normalizeUsername } from "./utils";

describe("username normalization", () => {
  test("normalizeString transliterates and lowercases without trimming", () => {
    expect(normalizeString("\u00E8")).toBe("e");
    expect(normalizeString(" ALICE ")).toBe(" alice ");
  });

  test("normalizeUsername trims the normalized username", () => {
    expect(normalizeUsername(" ALICE ")).toBe("alice");
  });
});
