import { VARIANT_NAMES } from "@hanabi-live/game";
import { describe, expect, test } from "vitest";
import {
  canAdd,
  canHaveSuits,
  getCatalog,
  getChoice,
  getMatches,
  toggle,
} from "./variantBuilder.ts";

const catalog = getCatalog();

function names(variants: ReturnType<typeof getMatches>): readonly string[] {
  return variants.map(({ variant }) => variant.name);
}

describe("variant builder", () => {
  test("finds every variant of the catalog from its own parts", () => {
    for (const name of VARIANT_NAMES) {
      const choice = getChoice(catalog, name);
      expect(names(getMatches(catalog, choice))).toContain(name);
    }
  });

  test("names the parts as players know them", () => {
    expect(catalog.parts.get("ra")?.name).toBe("Rainbow");
    expect(catalog.parts.get("ra.dark")?.name).toBe("Dark Rainbow");
    expect(catalog.parts.get("1pi")?.name).toBe("Pink 1s");
    expect(catalog.parts.get("4crit")?.name).toBe("Critical 4s");
    expect(catalog.parts.get("hole")?.name).toBe("Throw It in a Hole");
  });

  test("combines parts into one variant", () => {
    const choice = toggle(
      toggle(
        {
          numSuits: 6,
          parts: new Set(),
        },
        "ra",
      ),
      "bk",
    );
    expect(names(getMatches(catalog, choice))).toContain(
      "Black & Rainbow (6 Suits)",
    );
  });

  test("offers only the parts and suit counts that lead to a variant", () => {
    const choice = toggle(
      {
        numSuits: 4,
        parts: new Set(),
      },
      "ra",
    );
    expect(canAdd(catalog, choice, "sudoku")).toBe(true);
    expect(canAdd(catalog, choice, "cowpig")).toBe(false);
    const cowAndPig = toggle(
      {
        numSuits: undefined,
        parts: new Set(),
      },
      "cowpig",
    );
    expect(canHaveSuits(catalog, cowAndPig, 3)).toBe(true);
    expect(canHaveSuits(catalog, toggle(cowAndPig, "ra"), 3)).toBe(false);
  });
});
