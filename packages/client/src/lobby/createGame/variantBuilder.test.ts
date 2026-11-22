import { getSuit, getVariant, VARIANT_NAMES } from "@hanabi-live/game";
import { describe, expect, test } from "vitest";
import type { Choice } from "./variantBuilder.ts";
import {
  canBeCritical,
  getCatalogName,
  getChoice,
  getFlagTooltip,
  getOtherVersion,
  getParts,
  getRecipe,
  getReverseBlocker,
  getSuitDescription,
  getVariantName,
  setNumSuits,
  setSpecialRank,
  toggleDark,
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
    expect(getVariantName(combined)).toBe(
      "Pink-Threes & Scarce Ones & Duck & Funnels & Black Reversed & Rainbow (6 Suits)",
    );
  });

  test("turns off a rule that cannot be on with the one that turns on", () => {
    const duck = toggleFlag(toggleFlag(FIVE_SUITS, "cowpig"), "duck");
    expect([...duck.flags]).toEqual(["duck"]);
    expect([...toggleFlag(duck, "cowpig").flags]).toEqual(["cowpig"]);
    const chimneys = toggleFlag(toggleFlag(FIVE_SUITS, "funnels"), "chimneys");
    expect([...chimneys.flags]).toEqual(["chimneys"]);
    const muted = build(
      FIVE_SUITS,
      (c) => toggleFlag(c, "cb"),
      (c) => toggleFlag(c, "alt"),
      (c) => toggleFlag(c, "cm"),
    );
    expect([...muted.flags]).toEqual(["cm"]);
  });

  test("says which rules a rule turns off", () => {
    const blind = toggleFlag(FIVE_SUITS, "nb");
    expect(getFlagTooltip(blind, "nm")).toContain("Turns off Number Blind.");
    expect(getFlagTooltip(blind, "nb")).not.toContain("Turns off");
    expect(getFlagTooltip(toggleReversed(FIVE_SUITS, "p"), "sudoku")).toContain(
      "Ends every reversed suit.",
    );
  });

  test("knows when a critical rank changes the deck", () => {
    expect(canBeCritical(FIVE_SUITS, 5)).toBe(false);
    expect(canBeCritical(FIVE_SUITS, 4)).toBe(true);
    expect(canBeCritical(toggleReversed(FIVE_SUITS, "p"), 5)).toBe(true);
    expect(canBeCritical(toggleFlag(FIVE_SUITS, "sudoku"), 5)).toBe(true);
    expect(canBeCritical(toggleFlag(FIVE_SUITS, "updown"), 1)).toBe(false);
  });

  test("ends every reversal when Up or Down or Sudoku turns on", () => {
    const reversed = toggleReversed(FIVE_SUITS, "p");
    expect(getRecipe(reversed)).toBe("r-y-g-b-p.rev");
    expect(getRecipe(toggleFlag(reversed, "updown"))).toBe("r-y-g-b-p_updown");
    expect(getRecipe(toggleFlag(reversed, "sudoku"))).toBe("r-y-g-b-p_sudoku");
    expect(getReverseBlocker(toggleFlag(FIVE_SUITS, "sudoku"))).toBe("sudoku");
  });

  test("keeps each suit once, and grows a full deck", () => {
    const dark = build(
      FIVE_SUITS,
      (c) => toggleSuit(c, "ra"),
      (c) => toggleReversed(c, "ra"),
      (c) => toggleDark(c, "ra"),
    );
    expect(dark.suits).toEqual(["ra.dark"]);
    expect(getRecipe(dark)).toBe("r-y-g-b-ra.dark.rev");
    expect(getRecipe(toggleDark(dark, "ra.dark"))).toBe("r-y-g-b-ra.rev");
    // The chip of Rainbow removes Dark Rainbow.
    expect(toggleSuit(dark, "ra").suits).toEqual([]);
    // Red has no dark version.
    expect(getOtherVersion("r")).toBeUndefined();
    expect(toggleDark(FIVE_SUITS, "r")).toBe(FIVE_SUITS);

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

  test("describes each suit from its rules", () => {
    expect(getSuitDescription(getSuit("Rainbow"))).toBe(
      "Every color clue touches its cards. Rank clues touch its cards as usual.",
    );
    expect(getSuitDescription(getSuit("Black"))).toBe(
      "Black clues touch its cards. Rank clues touch its cards as usual. It has one card of each rank, so every card is critical.",
    );
    expect(getSuitDescription(getSuit("Tangerine"))).toBe(
      "Red and Yellow clues all touch its cards, and each of them touches other suits too. One color clue does not tell which suit a card is, but two can. Peach and Yam take the same clues. With two of these suits in a game, no color clue tells their cards apart. Rank clues touch its cards as usual.",
    );
    expect(getSuitDescription(getSuit("Tomato"))).toBe(
      "Red clues touch its cards, and the cards of other red suits, such as Red, Mahogany, and Carrot. With two red suits in a game, a Red clue cannot tell them apart, so the players must find the suit another way. Rank clues touch its cards as usual.",
    );
  });
});
