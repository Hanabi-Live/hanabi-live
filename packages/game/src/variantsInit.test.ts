import { describe, expect, test } from "bun:test";
import { COLORS_MAP, SUITS_MAP } from "./gameData.ts";
import { DEFAULT_VARIANT_ID, variantIdSchema } from "./generated/protocol.ts";
import { createVariant } from "./variantsInit.ts";

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
      DEFAULT_VARIANT_ID,
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
      variantIdSchema.parse(1),
      "custom-normal",
    );
    const nameOnlyPattern = new RegExp(nameOnly.identityNotePattern, "u");
    expect(nameOnlyPattern.test("start")).toBe(false);
    expect(nameOnlyPattern.test("0")).toBe(false);
  });
});
