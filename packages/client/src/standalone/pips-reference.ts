// Script to generate a visualization of all Hanabi pips. This can be compiled and served as a
// standalone page.

import type { Suit, Variant } from "@hanabi-live/game";
import { Pip, SUITS_MAP } from "@hanabi-live/game";
import { assertEnumValue, assertNotNull, getEnumValues } from "complete-common";
import { drawPip } from "../game/ui/drawPip";

document.addEventListener("DOMContentLoaded", () => {
  const uniquePips = new Map<
    string,
    { name: string; fill?: string; fillColors?: readonly string[] }
  >();

  for (const suit of SUITS_MAP.values()) {
    if (
      suit.pip !== "none"
      && suit.pip !== "auto"
      && !uniquePips.has(suit.pip)
    ) {
      uniquePips.set(suit.pip, {
        name: suit.name,
        fill: suit.fill,
        fillColors: suit.fillColors,
      });
    }
  }

  for (const pip of getEnumValues(Pip)) {
    if (!uniquePips.has(pip)) {
      uniquePips.set(pip, {
        name: pip,
      });
      console.warn(`The "${pip}" pip is not assigned a suit.`);
    }
  }

  const container = document.querySelector("#pips-container");
  assertNotNull(container, "Container element not found.");

  // Clear the loading message.
  container.innerHTML = "";

  // Create a canvas for each unique pip.
  let index = 0;
  for (const [pip, info] of uniquePips) {
    if (pip === "none" || pip === "auto") {
      continue;
    }
    assertEnumValue(pip, Pip, `Failed to parse pip: ${pip}`);

    const wrapper = document.createElement("div");
    wrapper.className = "pip-wrapper";

    const canvas = document.createElement("canvas");
    canvas.width = 200;
    canvas.height = 200;
    canvas.className = "pip-canvas";

    const ctx = canvas.getContext("2d");
    assertNotNull(ctx, "Failed to get the canvas.");

    // Center the drawing.
    ctx.save();
    ctx.translate(100, 100);

    const mockSuit: Partial<Suit> = {
      pip,
      fill: info.fill ?? "#cccccc",
      fillColors: info.fillColors ?? [],
    };

    const mockVariant: Partial<Variant> = {
      suits: [mockSuit as Suit],
      pips: [pip],
    };

    try {
      drawPip(ctx, mockSuit as Suit, mockVariant as Variant);
    } catch (error) {
      console.error(`Error drawing pip ${pip}:`, error);
    }

    ctx.restore();

    const label = document.createElement("div");
    label.className = "pip-label";
    label.innerHTML = `
      <div class="pip-name">${info.name}</div>
      <div class="pip-id">${pip}</div>
    `;

    wrapper.append(canvas);
    wrapper.append(label);
    container.append(wrapper);

    index++;
  }

  const count = document.createElement("div");
  count.className = "pip-count";
  count.textContent = `Total unique pips: ${index}`;
  container.append(count);
});
