// This script will populate the card images directory with the SVG conversions
// This is meant to be run from NodeJS
// e.g. "node createAllCards.js"

// Imports
import fs from "fs";
import path from "path";
import { VARIANTS } from "../src/game/data/gameData";
import { START_CARD_RANK, UNKNOWN_CARD_RANK } from "../src/game/types/constants";
import drawCards from "../src/game/ui/drawCards";
import * as drawCardsNode from "./drawCardsNode";

// Get the "No Variant" variant
const variantName = "Brown (6 Suits)";
const variant = VARIANTS.get(variantName);
if (variant === undefined) {
  console.error(
    `Failed to get the ${variantName} variant from the variants map.`,
  );
  process.exit(1);
}

const cardImages = drawCards(
  variant,
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
  if (key === "deck-back") {
    continue;
  }

  // e.g. "card-Blue-0.svg" --> "b.svg"
  // e.g. "card-Blue-1.svg" --> "b1.svg"
  const match = /^(\w+)-(\w+)-(\d)$/.exec(key);
  let fileName: string |undefined;
  if (match) {
    const type = match[1];
    const suit = match[2];
    const rankString = match[3];
    const rank = parseInt(rankString, 10);
    if (rank === START_CARD_RANK) {
      continue;
    }

    if (type === "card") {
      if (suit === "Unknown") {
        // We only care about the real unknown ranks
        if (rank >= 1 && rank <= 5) {
          fileName = rank.toString();
        }
      } else {
	let suitAbbrev = variant.suits.find(s => s.name === suit)?.abbreviation.toLowerCase();
        fileName = rank === UNKNOWN_CARD_RANK ? suitAbbrev : `${suitAbbrev}${rank}`;
      }
    }
  } else {
    throw new Error(`Failed to parse the following key: ${key}`);
  }
  if (fileName === undefined) {
    continue;
  }

  const filePath = path.join(__dirname, "cards", `${fileName}.svg`);
  try {
    fs.writeFileSync(filePath, (value as unknown) as string, "utf8");
  } catch (err) {
    throw new Error(`Failed to write the SVG file "${filePath}": ${err}`); // eslint-disable-line
  }
  console.log("Wrote file:", filePath);
}

console.log("Completed!");
