import { getDefaultVariant } from "@hanabi-live/game";
import { describe, expect, test } from "vitest";
import { parseNote } from "./notesReducer.ts";

function noteWithoutText(note: ReturnType<typeof parseNote>) {
  return {
    ...note,
    text: "",
  };
}

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

  test.each([
    ["spook", true],
    ["[Spook]", true],
    ["boo [spook]", true],
    ["spooky", false],
  ])("parses the spook keyword in %j", (text, expected) => {
    expect(parseNote(VARIANT, text).spook).toBe(expected);
  });

  test.each([
    ["kt?", "[kt][?]"],
    ["f?", "[f][?]"],
    ["r3!", "[r3][!]"],
    ["R3!", "[r3][!]"],
    ["rb23?", "[rb23][?]"],
    ["r,!2?", "[r,!2][?]"],
    ["[kt?]", "[kt][?]"],
    ["prose | f?", "[f][?]"],
  ])("%j is read like %j", (text, expanded) => {
    expect(noteWithoutText(parseNote(VARIANT, text))).toEqual(
      noteWithoutText(parseNote(VARIANT, expanded)),
    );
  });

  test.each(["what?", "maybe r3?", "kt??"])(
    "%j does not split a trailing mark",
    (text) => {
      const note = parseNote(VARIANT, text);
      expect(note.knownTrash).toBe(false);
      expect(note.possibilities).toEqual(parseNote(VARIANT, "").possibilities);
    },
  );

  test("handles a long unterminated bracket sequence", () => {
    const text = "[".repeat(100_000);
    expect(parseNote(VARIANT, text).chopMoved).toBe(false);
  });
});
