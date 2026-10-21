import { describe, expect, test } from "@jest/globals";
import { COLORS_MAP, SUITS_MAP } from "./gameData";
import { createVariant } from "./variantsInit";

describe("createVariant identity notes", () => {
  test("detects Up or Down from metadata instead of the variant name", () => {
    const customUpOrDown = createVariant(
      COLORS_MAP,
      SUITS_MAP,
      {
        name: "Custom with Up or Down",
        suits: ["Red", "Green", "Blue"],
        upOrDown: true,
      },
      0,
      "custom-up-or-down",
    );
    const customPattern = new RegExp(customUpOrDown.identityNotePattern, "u");
    expect(customPattern.test("start")).toBe(true);
    expect(customPattern.test("0")).toBe(true);

    const nameOnly = createVariant(
      COLORS_MAP,
      SUITS_MAP,
      {
        name: "Up or Down (3 Suits)",
        suits: ["Red", "Green", "Blue"],
      },
      1,
      "custom-normal",
    );
    const nameOnlyPattern = new RegExp(nameOnly.identityNotePattern, "u");
    expect(nameOnlyPattern.test("start")).toBe(false);
    expect(nameOnlyPattern.test("0")).toBe(false);
  });
});
