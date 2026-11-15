import { globals } from "./UiGlobals.ts";

/** Draws the pips of the classic screen's cards again, after the empathy style changes. */
export function redrawCardPips(): void {
  for (const card of globals.deck) {
    card.updatePips();
  }
  globals.layers.card.batchDraw();
}
