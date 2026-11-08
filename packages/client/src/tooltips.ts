// The central point for all tooltips.

import { MAX_DECK_SIZE, MAX_PLAYERS, MAX_SUITS } from "@hanabi-live/game";
import { eRange } from "complete-common";
import type { TooltipSide } from "./Tooltip";
import { hoverTooltip, Tooltip } from "./Tooltip";
import { globals } from "./game/ui/UIGlobals";
import { getHTMLElement } from "./utils";

export const TOOLTIP_DELAY_IN_MILLISECONDS = 500;

/** The style of tooltip text that is smaller than the default. */
export const SMALL_TOOLTIP_TEXT_STYLE = "font-size: 0.75em;";

const CLIPBOARD_CONTENT = `<span style="${SMALL_TOOLTIP_TEXT_STYLE}">URL copied to clipboard!</span>`;

/** The tooltips of the page, by their anchor element. */
const tooltips = new WeakMap<HTMLElement, Tooltip>();

/** The in-game tooltips, which last for the whole session. */
const gameTooltips: Tooltip[] = [];

// Initialize in-game tooltips (for notes, etc.)
export function initGame(): void {
  createGameTooltips();
  createPlayerTooltips();
  createCardTooltips();
}

/**
 * Creates a tooltip that opens on hover, showing the element that the anchor's
 * "data-tooltip-content" attribute selects. A "clipboard" tooltip instead opens only when told to.
 */
export function create(
  selector: string,
  type: "clipboard" | "hover" = "hover",
): void {
  const anchor = getHTMLElement(selector);
  if (tooltips.has(anchor)) {
    return;
  }

  if (type === "clipboard") {
    tooltips.set(anchor, new Tooltip(anchor, { content: CLIPBOARD_CONTENT }));
    return;
  }

  tooltips.set(anchor, hoverTooltip(anchor));
}

/**
 * Adds a tooltip with HTML content that opens on hover to an element that React renders. Returns a
 * function that removes it.
 */
export function attach(element: HTMLElement, content: string): () => void {
  const tooltip = new Tooltip(element, { content });
  tooltip.openOnHover();
  return () => {
    tooltip.destroy();
  };
}

export function open(selector: string): void {
  getTooltip(selector)?.open();
}

export function close(selector: string): void {
  if (globals.editingNote === selector) {
    globals.editingNote = null;
  }

  getTooltip(selector)?.close();
}

export function closeAllTooltips(): void {
  globals.editingNote = null;

  for (const tooltip of gameTooltips) {
    tooltip.close();
  }
}

/** Clear player clock tooltips retained from a previously viewed game. */
export function clearPlayerTimeTooltips(): void {
  for (const i of eRange(MAX_PLAYERS)) {
    setContent(`#tooltip-player-${i}`, "");
  }
}

export function setContent(selector: string, content: string): void {
  getTooltip(selector)?.setContent(content);
}

export function setPosition(selector: string, x: number, y: number): void {
  const anchor = getHTMLElement(selector);
  anchor.style.left = `${x}px`;
  anchor.style.top = `${y}px`;
}

export function setSide(selector: string, side: TooltipSide): void {
  const tooltip = getTooltip(selector);
  if (tooltip !== undefined) {
    tooltip.side = side;
  }
}

/** Whether the tooltip is still shrinking after it was closed. */
export function isClosing(selector: string): boolean {
  return getTooltip(selector)?.isClosing ?? false;
}

function getTooltip(selector: string): Tooltip | undefined {
  const anchor = document.querySelector<HTMLElement>(selector);
  return anchor === null ? undefined : tooltips.get(anchor);
}

/** Creates an in-game tooltip, which "konvaTooltips.ts" positions and opens. */
function createGameTooltip(id: string, centered = false) {
  const anchor = document.createElement("div");
  anchor.id = id;
  getHTMLElement("#game-tooltips").append(anchor);

  // Interactive so that users can update their notes.
  const tooltip = new Tooltip(anchor, {
    content: "",
    interactive: true,
    centered,
  });
  tooltips.set(anchor, tooltip);
  gameTooltips.push(tooltip);
}

function createGameTooltips() {
  // Initialize some basic tooltips.
  const names = [
    "chat",
    "deck",
    "discard",
    "efficiency-text",
    "efficiency-number",
    "hypo-back",
    "hypo-edit-cards",
    "hypo-show-drawn",
    "kill",
    "leader",
    "lobby",
    "lobby-small",
    "pace",
    "replay",
    "restart",
    "spectators",
    "strikes",
    "turn-number",
  ];
  for (const name of names) {
    createGameTooltip(`tooltip-${name}`);
  }

  createGameTooltip("tooltip-time-taken", true);
}

function createPlayerTooltips() {
  for (const i of eRange(MAX_PLAYERS)) {
    createGameTooltip(`tooltip-player-${i}`, true);
    createGameTooltip(`tooltip-character-assignment-${i}`, true);
  }
}

function createCardTooltips() {
  // Create the card note tooltips. (We add the number of suits because we also need note tooltips
  // for the stack bases.)
  for (const order of eRange(MAX_DECK_SIZE + MAX_SUITS)) {
    createGameTooltip(`tooltip-card-${order}`);
  }
}
