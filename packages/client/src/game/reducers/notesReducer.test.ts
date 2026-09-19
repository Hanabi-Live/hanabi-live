import { getDefaultVariant } from "@hanabi-live/game";
import { describe, expect, test } from "@jest/globals";
import { noteEqual, parseNote } from "./notesReducer";

const DEFAULT_VARIANT = getDefaultVariant();

describe("notesReducer", () => {
  describe("parseNote", () => {
    test("a section marker is not part of the note", () => {
      expect(
        noteEqual(
          parseNote(DEFAULT_VARIANT, "#7 r2"),
          parseNote(DEFAULT_VARIANT, "r2"),
        ),
      ).toBe(true);
    });

    test("the text of the note is kept as-is", () => {
      expect(parseNote(DEFAULT_VARIANT, "#7 !r2").text).toBe("#7 !r2");
    });

    test("a marker in an earlier section is ignored", () => {
      expect(
        noteEqual(
          parseNote(DEFAULT_VARIANT, "#3 b1 | #7 !r2"),
          parseNote(DEFAULT_VARIANT, "!r2"),
        ),
      ).toBe(true);
    });

    test("legacy notes without a marker are unchanged", () => {
      expect(
        noteEqual(
          parseNote(DEFAULT_VARIANT, "r2"),
          parseNote(DEFAULT_VARIANT, "r2"),
        ),
      ).toBe(true);
    });
  });
});
