import { getVariant, VARIANT_NAMES } from "@hanabi-live/game";
import { describe, expect, test } from "vitest";
import type { Choice } from "./variantBuilder.ts";
import {
  getCatalogName,
  getChoice,
  getParts,
  getRecipe,
  setNumSuits,
  setSpecialRank,
  toggleFlag,
  toggleReversed,
  toggleScarceOnes,
  toggleSpecialRule,
  toggleSuit,
} from "./variantBuilder.ts";

const FIVE_SUITS = getChoice("r-y-g-b-p");

function build(
  choice: Choice,
  ...steps: ReadonlyArray<(c: Choice) => Choice>
): Choice {
  let current = choice;
  for (const step of steps) {
    current = step(current);
  }
  return current;
}

describe("variant builder", () => {
  test("writes the recipe of almost every catalog variant", () => {
    const missed = VARIANT_NAMES.map((name) => getVariant(name).recipe).filter(
      (recipe) => getRecipe(getChoice(recipe)) !== recipe,
    );
    // The others are themed sets whose suits have an order of their own, such as
    // "r-gold-g-cyan-b-violet". Players find them by their names.
    expect(missed).toHaveLength(33);
  });

  test("makes a variant that the catalog does not have", () => {
    const choice = build(
      setNumSuits(FIVE_SUITS, 6),
      (c) => toggleSuit(c, "bk"),
      (c) => toggleSuit(c, "ra"),
    );
    expect(getRecipe(choice)).toBe("r-y-g-b-bk-ra");
    expect(getCatalogName(getRecipe(choice))).toBe("Black & Rainbow (6 Suits)");

    const combined = build(
      choice,
      (c) => toggleSpecialRule(c, "pi"),
      (c) => setSpecialRank(c, 3),
      toggleScarceOnes,
      (c) => toggleReversed(c, "bk"),
      (c) => toggleFlag(c, "funnels"),
      (c) => toggleFlag(c, "duck"),
    );
    expect(getRecipe(combined)).toBe(
      "r-y-g-b-bk.rev-ra_3pi_1scarce_duck_funnels",
    );
    expect(getCatalogName(getRecipe(combined))).toBeUndefined();
  });

  test("keeps each suit once, and grows a full deck", () => {
    const dark = build(
      FIVE_SUITS,
      (c) => toggleSuit(c, "ra"),
      (c) => toggleSuit(c, "ra.dark"),
    );
    expect(dark.suits).toEqual(["ra.dark"]);

    const full = build(
      getChoice("r"),
      (c) => toggleSuit(c, "bk"),
      (c) => toggleSuit(c, "ra"),
    );
    expect(full.numSuits).toBe(2);
    expect(getRecipe(full)).toBe("bk-ra");
    expect(setNumSuits(full, 1).numSuits).toBe(2);
  });

  test("offers every suit and rule", () => {
    const parts = getParts();
    expect(parts.suits.map(({ id }) => id)).toContain("gold");
    expect(parts.specialRanks.map(({ code }) => code)).toContain("de");
    expect(
      [...parts.clueFlags, ...parts.playFlags].map(({ name }) => name),
    ).toContain("Cow and Pig");
  });
});
