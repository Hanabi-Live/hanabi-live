// Script to generate a visualization of all Hanabi pips
// This can be compiled and served as a standalone page

import type { Suit } from "@hanabi-live/game";
import { drawPip } from "./game/ui/drawPip";
import { SUITS_MAP } from "@hanabi-live/game";

// Get unique pips from SUITS_MAP
const uniquePips = new Map<string, { name: string; fill?: string; fillColors?: readonly string[] }>();

for (const suit of SUITS_MAP.values()) {
  if (suit.pip && !uniquePips.has(suit.pip)) {
    uniquePips.set(suit.pip, {
      name: suit.name,
      fill: suit.fill,
      fillColors: suit.fillColors,
    });
  }
}

// Initialize the visualization when DOM is ready
document.addEventListener("DOMContentLoaded", () => {
  const container = document.getElementById("pips-container");
  if (!container) {
    console.error("Container element not found");
    return;
  }

  // Clear loading message
  container.innerHTML = "";

  // Create a canvas for each unique pip
  let index = 0;
  for (const [pipName, info] of uniquePips.entries()) {
    // Skip empty pip (Unknown suit)
    if (!pipName) continue;

    const wrapper = document.createElement("div");
    wrapper.className = "pip-wrapper";

    const canvas = document.createElement("canvas");
    canvas.width = 200;
    canvas.height = 200;
    canvas.className = "pip-canvas";

    const ctx = canvas.getContext("2d");
    if (!ctx) continue;

    // Center the drawing
    ctx.save();
    ctx.translate(100, 100);

    // Create a mock suit object for drawing
    const mockSuit: Partial<Suit> = {
      pip: pipName,
      fill: info.fill || "#cccccc",
      fillColors: info.fillColors || [],
    };

    // Draw the pip
    try {
      drawPip(ctx, mockSuit as Suit, false, false);
    } catch (error) {
      console.error(`Error drawing pip ${pipName}:`, error);
    }

    ctx.restore();

    // Create label
    const label = document.createElement("div");
    label.className = "pip-label";
    label.innerHTML = `
      <div class="pip-name">${info.name}</div>
      <div class="pip-id">${pipName}</div>
    `;

    wrapper.appendChild(canvas);
    wrapper.appendChild(label);
    container.appendChild(wrapper);

    index++;
  }

  // Add count
  const count = document.createElement("div");
  count.className = "pip-count";
  count.textContent = `Total unique pips: ${index}`;
  container.appendChild(count);
});
