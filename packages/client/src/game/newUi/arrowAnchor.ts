// Where the highlight arrow points on the redesigned game screen: which element stands for each
// target, and which target a right-click lands on.

import type { CardOrder, CardState } from "@hanabi-live/game";
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
] as const satisfies ReadonlyArray<readonly [ReplayBoardElement, string]>;

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

/**
 * What a right-click on an element points the arrow at, if anything. A right-click on a play stack
 * lands on its top card, or on its stack base when the stack is empty.
 */
export function getArrowTargetAt(element: Element): ArrowTarget | undefined {
  const card = element.closest<HTMLElement>(
    "[data-card-order], [data-stack-base-arrow]",
  );
  const order = card?.dataset["cardOrder"] ?? card?.dataset["stackBaseArrow"];
  if (order !== undefined && order !== "") {
    return Number(order) as CardOrder;
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
 * stack base, point at the stack.
 */
export function findArrowAnchor(
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

  const entry = BOARD_ELEMENT_SELECTORS.find(
    ([boardElement]) => boardElement === target,
  );
  const element = entry === undefined ? null : root.querySelector(entry[1]);
  return element ?? undefined;
}

/**
 * The box that the arrow points at, in the window's pixels. For "5 / 21", it is the box of the
 * first number.
 */
export function measureArrowAnchor(
  anchor: Element,
  target: ArrowTarget,
): DOMRect {
  const first = anchor.firstChild;
  if (
    first === null
    || typeof target === "number"
    || !FIRST_NUMBER_ELEMENTS.has(target)
  ) {
    return anchor.getBoundingClientRect();
  }

  const range = document.createRange();
  range.selectNodeContents(first);
  const rect = range.getBoundingClientRect();
  return rect.width === 0 ? anchor.getBoundingClientRect() : rect;
}
