// The central point for all tooltips.

import { MAX_DECK_SIZE, MAX_PLAYERS, MAX_SUITS } from "@hanabi-live/game";
import { eRange, SECOND_IN_MILLISECONDS } from "complete-common";
import { Tooltip } from "./Tooltip.ts";
import { globals } from "./game/ui/UiGlobals.ts";
import { getHtmlElement } from "./utils.ts";

/** How long the tooltip that confirms a copied URL stays open. */
const COPIED_TOOLTIP_MILLISECONDS = SECOND_IN_MILLISECONDS;

const CLIPBOARD_CONTENT =
  '<span class="small-tooltip-text">URL copied to clipboard!</span>';

/** The in-game tooltips that are not for a player or a card. */
const GAME_TOOLTIP_NAMES = [
  "chat",
  "deck",
  "efficiency-number",
  "efficiency-text",
  "hypo-back",
  "hypo-edit-cards",
  "hypo-pass-turn",
  "hypo-show-drawn",
  "kill",
  "leader",
  "lobby",
  "new-ui",
  "pace",
  "post-clue-empathy",
  "replay",
  "restart",
  "restart-ready",
  "spectators",
  "strikes",
  "time-taken",
  "turn-number",
] as const;

/** The name of an in-game tooltip. A card's tooltip holds its note. */
export type GameTooltipName =
  | (typeof GAME_TOOLTIP_NAMES)[number]
  | `card-${number}`
  | `character-assignment-${number}`
  | `player-${number}`;

/** The in-game tooltips, which last for the whole session. */
const gameTooltips = new Map<GameTooltipName, GameTooltip>();

interface GameTooltip {
  readonly anchor: HTMLElement;
  readonly tooltip: Tooltip;
}

/** Creates the in-game tooltips. Only the tooltips of cards take the pointer, to edit notes. */
export function initGame(): void {
  for (const name of GAME_TOOLTIP_NAMES) {
    createGameTooltip(name, { centered: name === "time-taken" });
  }

  for (const i of eRange(MAX_PLAYERS)) {
    createGameTooltip(`player-${i}`, { centered: true });
    createGameTooltip(`character-assignment-${i}`, { centered: true });
  }

  // Stack bases have notes in some variants, so they have note tooltips too.
  for (const order of eRange(MAX_DECK_SIZE + MAX_SUITS)) {
    createGameTooltip(`card-${order}`, { interactive: true });
  }
}

/** Briefly shows, beside an element, that a URL was copied to the clipboard. */
export function showCopied(element: HTMLElement): void {
  const tooltip = new Tooltip(element, { content: CLIPBOARD_CONTENT });
  tooltip.open();
  setTimeout(() => {
    tooltip.close();
  }, COPIED_TOOLTIP_MILLISECONDS);
}

export function open(name: GameTooltipName): void {
  gameTooltips.get(name)?.tooltip.open();
}

export function close(name: GameTooltipName): void {
  if (globals.editingNote === name) {
    globals.editingNote = undefined;
  }

  gameTooltips.get(name)?.tooltip.close();
}

export function closeAllTooltips(): void {
  globals.editingNote = undefined;

  for (const { tooltip } of gameTooltips.values()) {
    tooltip.close();
  }
}

/** Clear player clock tooltips retained from a previously viewed game. */
export function clearPlayerTimeTooltips(): void {
  for (const i of eRange(MAX_PLAYERS)) {
    setContent(`player-${i}`, "");
  }
}

export function setContent(name: GameTooltipName, content: string): void {
  gameTooltips.get(name)?.tooltip.setContent(content);
}

/**
 * Puts an in-game tooltip's anchor over an element of the game canvas, so that the tooltip opens
 * above or below the element. A tooltip over the element would take the pointer from it and close.
 */
export function setPosition(
  name: GameTooltipName,
  rect: Readonly<Pick<DOMRect, "x" | "y" | "width" | "height">>,
): void {
  const gameTooltip = gameTooltips.get(name);
  if (gameTooltip === undefined) {
    return;
  }

  const { anchor } = gameTooltip;
  anchor.style.left = `${rect.x}px`;
  anchor.style.top = `${rect.y}px`;
  anchor.style.width = `${rect.width}px`;
  anchor.style.height = `${rect.height}px`;
}

/** Whether the tooltip is still fading out after it was closed. */
export function isClosing(name: GameTooltipName): boolean {
  return gameTooltips.get(name)?.tooltip.isClosing ?? false;
}

/** Creates an in-game tooltip, which "konvaTooltips.ts" positions and opens. */
function createGameTooltip(
  name: GameTooltipName,
  options: { readonly interactive?: boolean; readonly centered?: boolean },
) {
  const anchor = document.createElement("div");
  getHtmlElement("#game-tooltips").append(anchor);
  const tooltip = new Tooltip(anchor, {
    content: "",
    ...options,
  });
  gameTooltips.set(name, {
    anchor,
    tooltip,
  });
}
