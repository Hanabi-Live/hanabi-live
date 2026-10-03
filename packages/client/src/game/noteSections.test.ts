import { describe, expect, test } from "@jest/globals";
import {
  composeNoteSections,
  getSectionMarker,
  getSectionText,
  getSectionsToEdit,
  moveSectionToRound,
  normalizeNoteSections,
  normalizeNoteText,
  parseNoteSections,
  serializeNoteSections,
  setSectionText,
  stripSectionMarker,
} from "./noteSections";

// A representative note covering the shared parsing cases: a legacy section, two marked sections,
// and a pipe inside a section's text.
const NOTE_TEXT = "legacy | #3 r2 | [f] | #7 !r2";

describe("noteSections", () => {
  test("markers", () => {
    expect(getSectionMarker(7)).toBe("#7");
    expect(stripSectionMarker("#5 r2")).toBe("r2");
    expect(stripSectionMarker("#12")).toBe("");
    expect(stripSectionMarker("r2")).toBe("r2");
    expect(stripSectionMarker("known from #5")).toBe("known from #5");
  });

  test("parsing and serialization round-trip", () => {
    expect(parseNoteSections("")).toEqual([]);
    expect(parseNoteSections(" | | ")).toEqual([]);
    expect(parseNoteSections("r2 known from turn 3")).toEqual([
      { round: null, text: "r2 known from turn 3" },
    ]);
    expect(parseNoteSections(NOTE_TEXT)).toEqual([
      { round: null, text: "legacy" },
      { round: 3, text: "r2 | [f]" },
      { round: 7, text: "!r2" },
    ]);

    expect(serializeNoteSections(parseNoteSections(NOTE_TEXT))).toBe(NOTE_TEXT);
    expect(serializeNoteSections([{ round: 3, text: "" }])).toBe("");
  });

  test("normalization", () => {
    expect(
      normalizeNoteSections([
        { round: null, text: "  " },
        { round: 9, text: "c" },
        { round: 3, text: "" },
        { round: 3, text: "a" },
        { round: null, text: "legacy" },
        { round: 7, text: "b" },
      ]),
    ).toEqual([
      { round: null, text: "legacy" },
      { round: 3, text: "a" },
      { round: 7, text: "b" },
      { round: 9, text: "c" },
    ]);

    expect(normalizeNoteText("#9 c | #3 a | #3 b")).toBe("#3 b | #9 c");
    expect(normalizeNoteText("#3 a | #9 c")).toBe("#3 a | #9 c");
    expect(normalizeNoteText("")).toBe("");
  });

  test("getting and setting the text of a section", () => {
    expect(getSectionText(NOTE_TEXT, 3)).toBe("r2 | [f]");
    expect(getSectionText(NOTE_TEXT, 7)).toBe("!r2");
    expect(getSectionText(NOTE_TEXT, 9)).toBe("");

    expect(setSectionText("#3 r2 | #7 !r2", 3, "b1")).toBe("#3 b1 | #7 !r2");
    expect(setSectionText("#3 r2", 7, "[f]")).toBe("#3 r2 | #7 [f]");
    expect(setSectionText("#3 r2 | #7 !r2", 3, "")).toBe("#7 !r2");
    expect(setSectionText("r2 | #7 !r2", 9, "[f]")).toBe(
      "r2 | #7 !r2 | #9 [f]",
    );
  });

  test("moving a section to another round", () => {
    expect(moveSectionToRound(NOTE_TEXT, 3, 5)).toBe(
      "legacy | #5 r2 | [f] | #7 !r2",
    );
    expect(moveSectionToRound(NOTE_TEXT, 7, 2)).toBe(
      "legacy | #2 !r2 | #3 r2 | [f]",
    );
    expect(moveSectionToRound(NOTE_TEXT, null, 5)).toBe(
      "#3 r2 | [f] | #5 legacy | #7 !r2",
    );
    expect(moveSectionToRound(NOTE_TEXT, 9, 5)).toBe(NOTE_TEXT);
  });

  test("the note editor rows", () => {
    expect(getSectionsToEdit("#3 a | #9 c", 5)).toEqual([
      { round: 3, text: "a" },
      { round: 5, text: "" },
      { round: 9, text: "c" },
    ]);
    expect(getSectionsToEdit("#3 a | #7 b", 7)).toEqual([
      { round: 3, text: "a" },
      { round: 7, text: "b" },
    ]);
    expect(getSectionsToEdit("r2", 5)).toEqual([
      { round: null, text: "r2" },
      { round: 5, text: "" },
    ]);

    const rows = getSectionsToEdit("legacy | #3 a", 5);
    expect(composeNoteSections(rows, ["legacy text", "a", "[f]"])).toEqual([
      { round: null, text: "legacy text" },
      { round: 3, text: "a" },
      { round: 5, text: "[f]" },
    ]);
    expect(composeNoteSections(rows, ["", "", ""])).toEqual([]);
  });

  test("a marker typed at the beginning of a row moves the text to that round", () => {
    const rows = getSectionsToEdit("legacy | #3 a", 5);

    // Typing a marker at the start of any row moves the text into the marked section. This includes
    // the row that is auto-inserted for the current round.
    expect(composeNoteSections(rows, ["#2 moved", "a", "plain"])).toEqual([
      { round: 2, text: "moved" },
      { round: 3, text: "a" },
      { round: 5, text: "plain" },
    ]);
    expect(composeNoteSections(rows, ["#2 moved", "a", "#9 x"])).toEqual([
      { round: 2, text: "moved" },
      { round: 3, text: "a" },
      { round: 9, text: "x" },
    ]);

    // A marker with no text after it simply empties the row.
    expect(composeNoteSections(rows, ["#2", "a", ""])).toEqual([
      { round: 3, text: "a" },
    ]);

    const edited = composeNoteSections(rows, ["#2 moved", "a", "plain"]);
    expect(normalizeNoteText(serializeNoteSections(edited))).toBe(
      "#2 moved | #3 a | #5 plain",
    );
  });
});
