import { getDefaultVariant } from "@hanabi-live/game";
import { describe, expect, test } from "@jest/globals";
import { parseNote } from "./notesReducer";

const VARIANT = getDefaultVariant();

describe("parseNote", () => {
  test.each([
    ["cm", true],
    ["prose [cm] more prose", true],
    ["[cm] [f]", true],
    ["[[cm]", false],
    ["[unfinished\n[cm]", true],
    ["[c\nm]", false],
    ["[unfinished | cm", true],
    ["[cm] | prose", false],
    ["[cm", false],
    ["[]", false],
    ["", false],
  ])("parses chop-moved keywords in %j", (text, expected) => {
    expect(parseNote(VARIANT, text).chopMoved).toBe(expected);
  });

  test.each(["[xf]", "[ctp]", "[XF]", "[CTP]"])(
    "%s combines unclued and finesse effects",
    (text) => {
      const shorthand = parseNote(VARIANT, text);
      const expanded = parseNote(VARIANT, "[x][f]");
      expect(shorthand.finessed).toBe(true);
      expect(shorthand.unclued).toBe(true);
      expect(shorthand.possibilities).toEqual(expanded.possibilities);
      expect(shorthand.clued).toBe(expanded.clued);
    },
  );

  test("handles a long unterminated bracket sequence", () => {
    const text = "[".repeat(100_000);
    expect(parseNote(VARIANT, text).chopMoved).toBe(false);
  });
});
