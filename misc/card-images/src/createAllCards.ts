// This script will populate the card images directory with the SVG conversions This is meant to be
// run from NodeJS. e.g. "node createAllCards.js"

import { START_CARD_RANK } from "@hanabi/data";
import fs from "node:fs";
import path from "node:path";
import { getVariant } from "../../data/src/gameData";
import { drawCards } from "../src/game/ui/drawCards";
import * as drawCardsNode from "./drawCardsNode";

const UNKNOWN_CARD_RANK = 6;

// Get the specified variant.
const variant = getVariant("Brown (6 Suits)");

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

for (const [key, value] of allCardImages) {
  if (key === "deck-back") {
    continue;
  }

  // e.g. "card-Blue-0.svg" --> "b.svg"
  // e.g. "card-Blue-1.svg" --> "b1.svg"
  const match = /^(\w+)-(\w+)-(\d)$/.exec(key);
  let fileName: string | undefined;
  if (match === null) {
    throw new Error(`Failed to parse the following key: ${key}`);
  } else {
    const [, type, suit, rankString] = match;
    if (type === undefined || suit === undefined || rankString === undefined) {
      continue;
    }

    const rank = Number.parseInt(rankString, 10);
    if (rank === START_CARD_RANK) {
      continue;
    }

    if (type === "card") {
      if (suit === "Unknown") {
        // We only care about the real unknown ranks.
        if (rank >= 1 && rank <= 5) {
          fileName = rank.toString();
        }
      } else {
        const suitAbbrev = variant.suits
          .find((s) => s.name === suit)
          ?.abbreviation.toLowerCase();
        fileName =
          rank === UNKNOWN_CARD_RANK ? suitAbbrev : `${suitAbbrev}${rank}`;
      }
    }
  }
  if (fileName === undefined) {
    continue;
  }

  const filePath = path.join(__dirname, "cards", `${fileName}.svg`);
  try {
    fs.writeFileSync(filePath, value as unknown as string, "utf8");
  } catch (error) {
    throw new Error(`Failed to write the SVG file "${filePath}": ${error}`);
  }
  console.log("Wrote file:", filePath);
}

console.log("Completed!");
