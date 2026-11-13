import { getDefaultVariant } from "@hanabi-live/game";
import { describe, expect, test } from "vitest";
import {
  appendToNote,
  getRightClickNoteAction,
  prependTurnToNote,
} from "./noteShortcuts.ts";

const variant = getDefaultVariant();
const NO_KEYS = {
  ctrlKey: false,
  shiftKey: false,
  altKey: false,
  metaKey: false,
} as const;

describe("getRightClickNoteAction", () => {
  test("a plain right-click edits the note, except in speedruns", () => {
    expect(getRightClickNoteAction(NO_KEYS, false)).toEqual({ type: "edit" });
    expect(getRightClickNoteAction(NO_KEYS, true)).toBeUndefined();
    expect(
      getRightClickNoteAction({ ...NO_KEYS, ctrlKey: true }, true),
    ).toEqual({ type: "edit" });
  });

  test("the keys held down choose a common note", () => {
    expect(
      getRightClickNoteAction({ ...NO_KEYS, shiftKey: true }, false),
    ).toEqual({ type: "append", text: "f" });
    expect(
      getRightClickNoteAction(
        { ...NO_KEYS, ctrlKey: true, shiftKey: true, altKey: true },
        false,
      ),
    ).toEqual({ type: "append", text: "kt" });
    expect(
      getRightClickNoteAction({ ...NO_KEYS, metaKey: true }, false),
    ).toBeUndefined();
  });
});

describe("appendToNote", () => {
  test("adds a new part with the word in brackets", () => {
    expect(appendToNote(variant, "", "f")).toBe("[f]");
    expect(appendToNote(variant, "r1 maybe", "cm")).toBe("r1 maybe | [cm]");
  });

  test("does nothing when the word does not change the note", () => {
    expect(appendToNote(variant, "[f]", "f")).toBeUndefined();
  });

  test("replaces a word that changes the border", () => {
    expect(appendToNote(variant, "[cm]", "f")).toBe("[cm] | [f]");
  });
});

describe("prependTurnToNote", () => {
  test("replaces the turn number of the last part", () => {
    expect(prependTurnToNote(variant, "#3 r1", 7)).toBe("#7 r1");
  });
});
