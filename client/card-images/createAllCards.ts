// This script will populate the card images directory with the SVG conversions
// This is meant to be run from NodeJS
// e.g. "node createAllCards.js"

// Imports
import fs from "fs";
import path from "path";
import { VARIANTS } from "../src/game/data/gameData";
import drawCards from "../src/game/ui/drawCards";
import * as drawCardsNode from "./drawCardsNode";

// Get the "No Variant" variant
const variantName = "Rainbow (6 Suits)";
const noVariant = VARIANTS.get(variantName);
if (noVariant === undefined) {
  console.error(
    `Failed to get the ${variantName} variant from the variants map.`,
  );
  process.exit(1);
}

const cardImages = drawCards(
  noVariant,
  false,
  false,
  false,
  drawCardsNode.initCanvas,
  drawCardsNode.cloneCanvas,
  drawCardsNode.saveCanvas,
);
const allCardImages = new Map<string, HTMLCanvasElement>();
for (const [key, value] of cardImages.entries()) {
  if (!allCardImages.has(key)) {
    allCardImages.set(key, value);
  }
}

console.log("Finished created all card images.");

for (const [key, value] of allCardImages.entries()) {
  const filePath = path.join(__dirname, "cards", `${key}.svg`);
  try {
    fs.writeFileSync(filePath, (value as unknown) as string, "utf8");
  } catch (err) {
    throw new Error(`Failed to write the SVG file "${filePath}": ${err}`); // eslint-disable-line
  }
  console.log("Wrote file:", filePath);
}

console.log("Completed!");
