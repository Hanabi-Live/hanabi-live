// @vitest-environment jsdom

import { describe, expect, test } from "vitest";
import { raiseMovingCard } from "./playMotion.ts";

describe("raiseMovingCard", () => {
  test("puts a card back when a new move starts before the last one ends", () => {
    const card = document.createElement("div");
    const endFirstMove = raiseMovingCard(card);
    const endSecondMove = raiseMovingCard(card);

    endFirstMove();
    expect(card.style.zIndex).not.toBe("");

    endSecondMove();
    expect(card.style.zIndex).toBe("");
    expect(card.style.position).toBe("");
  });
});
