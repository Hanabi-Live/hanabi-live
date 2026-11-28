// Where the highlight arrow points on the redesigned game screen: which element stands for each
// target, and which target a right-click lands on.

import type { CardOrder, CardState, PlayerIndex } from "@hanabi-live/game";
import { isCardPlayed } from "@hanabi-live/game";
import type { ArrowTarget, ReplayBoardElement } from "../highlightArrow.ts";

/**
 * The element that stands for each part of the board. A right-click inside one draws an arrow on
 * it. The most specific ones come first, since the maximum score is inside the score.
 */
const BOARD_ELEMENT_SELECTORS = [
  ["maxScore", "[data-score] [data-out-of-max]"],
  ["minEfficiency", "[data-efficiency] [data-out-of-max]"],
  ["turn", "[data-turn]"],
  ["score", "[data-score]"],
  ["efficiency", "[data-efficiency]"],
  ["pace", "[data-pace]"],
  ["deck", "[data-deck]"],
  ["clues", "[data-clue-count]"],
  ["strike1", '[data-strike-box="0"]'],
  ["strike2", '[data-strike-box="1"]'],
  ["strike3", '[data-strike-box="2"]'],
  ["discardPile", "[data-discard-pile]"],
] as const satisfies ReadonlyArray<readonly [ReplayBoardElement, string]>;

/**
 * The parts of the board whose arrow points at an element inside them. The discard pile is at the
 * top of the screen, with no room for the arrow above it, so the arrow points at its trash can.
 */
const INNER_ANCHOR_SELECTORS: ReadonlyMap<ReplayBoardElement, string> = new Map(
  [["discardPile", "[data-discard-pile] [data-discard-pile-icon]"]],
);

/**
 * The parts of the board whose element shows another number after their own, as "5 / 21" does. The
 * arrow points at the first number.
 */
const FIRST_NUMBER_ELEMENTS: ReadonlySet<ReplayBoardElement> = new Set([
  "efficiency",
  "score",
  "turn",
]);

function getCardSelector(order: CardOrder): string {
  return `[data-card-order="${order}"]`;
}

function getStackBaseSelector(order: CardOrder): string {
  return `[data-stack-base-arrow="${order}"]`;
}

function getNameChipSelector(playerIndex: PlayerIndex): string {
  return `[data-name-chip="${playerIndex}"]`;
}

/**
 * What a right-click on an element points the arrow at, if anything. A right-click on a play stack
 * lands on its top card, or on its stack base when the stack is empty. A right-click on a player's
 * name lands on the name.
 */
export function getArrowTargetAt(element: Element): ArrowTarget | undefined {
  const card = element.closest<HTMLElement>(
    "[data-card-order], [data-stack-base-arrow]",
  );
  const order = card?.dataset["cardOrder"] ?? card?.dataset["stackBaseArrow"];
  if (order !== undefined && order !== "") {
    return Number(order) as CardOrder;
  }

  const nameChip = element.closest<HTMLElement>("[data-name-chip]");
  const playerIndex = nameChip?.dataset["nameChip"];
  if (playerIndex !== undefined && playerIndex !== "") {
    return { playerIndex: Number(playerIndex) as PlayerIndex };
  }

  for (const [target, selector] of BOARD_ELEMENT_SELECTORS) {
    if (element.closest(selector) !== null) {
      return target;
    }
  }

  return undefined;
}

/**
 * Finds the element that the arrow points at. A played card under the top card of its stack, and a
 * stack base, point at the stack. A target in a tab that is not shown, such as the pace when the
 * panel shows the logs, points at that tab.
 */
export function findArrowAnchor(
  root: ParentNode,
  target: ArrowTarget,
  deck: readonly CardState[],
): Element | undefined {
  const element = findTargetElement(root, target, deck);
  const panel = element?.closest('[role="tabpanel"]');
  if (panel === null || panel === undefined || panel.id === "") {
    return element;
  }
  const tab = root.querySelector(
    `[role="tab"][aria-controls="${CSS.escape(panel.id)}"]`,
  );
  return tab?.getAttribute("aria-selected") === "false" ? tab : element;
}

function findTargetElement(
  root: ParentNode,
  target: ArrowTarget,
  deck: readonly CardState[],
): Element | undefined {
  if (typeof target === "number") {
    const card =
      root.querySelector(getCardSelector(target))
      ?? root.querySelector(getStackBaseSelector(target));
    if (card !== null) {
      return card;
    }
    const cardState = deck[target];
    if (
      cardState === undefined
      || cardState.suitIndex === undefined
      || !isCardPlayed(cardState)
    ) {
      return undefined;
    }
    const stackSelector = `[data-stack-slot="${CSS.escape(cardState.suitIndex.toString())}"]`;
    return root.querySelector(stackSelector) ?? undefined;
  }

  if (typeof target === "object") {
    return (
      root.querySelector(getNameChipSelector(target.playerIndex)) ?? undefined
    );
  }

  const entry = BOARD_ELEMENT_SELECTORS.find(
    ([boardElement]) => boardElement === target,
  );
  const selector = INNER_ANCHOR_SELECTORS.get(target) ?? entry?.[1];
  const element = selector === undefined ? null : root.querySelector(selector);
  return element ?? undefined;
}

/**
 * The text of the first number that an element shows. For "5 / 21", it is the "5". The number can
 * be some elements deep, and an invisible copy of the text can come before it to hold its space
 * (see "StatusStrip.tsx").
 */
export function findFirstNumberText(anchor: Element): Text | undefined {
  const walker = document.createTreeWalker(anchor, NodeFilter.SHOW_TEXT);
  for (let node = walker.nextNode(); node !== null; node = walker.nextNode()) {
    if (
      node.textContent?.trim() !== ""
      && node.parentElement?.closest('[aria-hidden="true"]') === null
    ) {
      return node as Text;
    }
  }
  return undefined;
}

/**
 * The box that the arrow points at, in the window's pixels. For "5 / 21", it is the box of the
 * first number. For a tab, it is the whole tab.
 */
export function measureArrowAnchor(
  anchor: Element,
  target: ArrowTarget,
): DOMRect {
  if (
    typeof target !== "string"
    || !FIRST_NUMBER_ELEMENTS.has(target)
    || anchor.getAttribute("role") === "tab"
  ) {
    return anchor.getBoundingClientRect();
  }

  const first = findFirstNumberText(anchor);
  if (first === undefined) {
    return anchor.getBoundingClientRect();
  }

  const range = document.createRange();
  range.selectNodeContents(first);
  const rect = range.getBoundingClientRect();
  return rect.width === 0 ? anchor.getBoundingClientRect() : rect;
}
