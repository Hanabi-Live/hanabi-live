// The images of a variant's cards, drawn on canvases. The classic screen draws its cards with them,
// and the morph dialog shows them.

import type { Variant } from "@hanabi-live/game";
import { store } from "../store.ts";
import { drawCards } from "./ui/drawCards.ts";
import { cardRendererBackend } from "./ui/drawCardsBrowser.ts";

let cached:
  | {
      readonly key: string;
      readonly images: ReadonlyMap<string, HTMLCanvasElement>;
    }
  | undefined;

/** Draws the cards once for each variant and card style, and keeps the last result. */
export function getCardImages(
  variant: Variant,
): ReadonlyMap<string, HTMLCanvasElement> {
  const { colorblindMode, styleNumbers } = store.getState().session.settings;
  const key = JSON.stringify([variant.id, colorblindMode, styleNumbers]);
  if (cached?.key !== key) {
    cached = {
      key,
      images: drawCards(
        variant,
        colorblindMode,
        styleNumbers,
        true,
        cardRendererBackend,
      ),
    };
  }

  return cached.images;
}
