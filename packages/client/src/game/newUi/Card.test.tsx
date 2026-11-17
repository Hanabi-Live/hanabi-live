// @vitest-environment jsdom

import type { Rank, SuitIndex } from "@hanabi-live/game";
import { getDefaultVariant, getVariant } from "@hanabi-live/game";
import { act, cleanup, fireEvent, render } from "@testing-library/react";
import { afterEach, beforeEach, expect, test, vi } from "vitest";
import { CLOSE_DURATION_IN_MILLISECONDS } from "../../Tooltip.ts";
import { CardFace } from "./Card.tsx";
import type { CardPipsView } from "./tableView.ts";

/** Where the card is in these tests, in the window's pixels, since jsdom has no layout. */
const CARD_RECT = {
  left: 400,
  top: 300,
  width: 60,
  height: 84,
} as const;

const PIPS = {
  suits: [],
  ranks: [],
  bubble: {
    suits: [
      {
        suitIndex: 0,
        eliminated: false,
        positive: false,
        ranks: [1],
        removed: [],
      },
    ],
  },
} as const satisfies CardPipsView;

function renderCard(trash: boolean, showPossibleCards = true) {
  return (
    <CardFace
      colorblindMode={false}
      pips={PIPS}
      rank={undefined}
      showPossibleCards={showPossibleCards}
      suitIndex={undefined}
      trash={trash}
      variant={getDefaultVariant()}
      width={CARD_RECT.width}
    />
  );
}

/** A stand-in for jsdom, which has no layout. */
class NoResizeObserver {
  readonly observe = vi.fn();
  readonly disconnect = vi.fn();
}

const animate = vi.fn<Element["animate"]>();

/** Waits for the bubble of possible cards to fade out. */
function waitForBubbleToClose() {
  act(() => {
    vi.advanceTimersByTime(CLOSE_DURATION_IN_MILLISECONDS);
  });
}

beforeEach(() => {
  vi.useFakeTimers();
  vi.stubGlobal("ResizeObserver", NoResizeObserver);
  // The "jsdom" library has no animations.
  animate.mockClear();
  Element.prototype.animate = animate;
  // An element that is on the page is where the card is. One that is not measures as nothing at the
  // top left, as it does in a browser.
  vi.spyOn(Element.prototype, "getBoundingClientRect").mockImplementation(
    function getRect(this: Element) {
      return this.isConnected
        ? new DOMRect(
            CARD_RECT.left,
            CARD_RECT.top,
            CARD_RECT.width,
            CARD_RECT.height,
          )
        : new DOMRect();
    },
  );
});

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

test("the bubble follows the card when the card stops being trash", () => {
  // Holding the pointer down on a hand shows its holder's view, where a card that is trash may not
  // be.
  const { container, rerender } = render(renderCard(true));
  const face = container.querySelector("[data-card-face]");
  expect(face).not.toBeNull();
  fireEvent.pointerEnter(face!);
  act(() => {
    rerender(renderCard(false));
  });

  // The face is the same element, so the pointer leaving it closes the bubble.
  expect(container.querySelector("[data-card-face]")).toBe(face);
  const bubble = document.querySelector("[data-possible-cards]");
  expect((bubble?.parentElement as HTMLElement | null)?.style.left).toBe(
    `${CARD_RECT.left + CARD_RECT.width / 2}px`,
  );
  fireEvent.pointerLeave(face!);
  waitForBubbleToClose();
  expect(document.querySelector("[data-possible-cards]")).toBeNull();
});

test("the bubble stays closed when the card missed the pointer leaving it", () => {
  const { container, rerender } = render(renderCard(false, false));
  const face = container.querySelector("[data-card-face]");
  expect(face).not.toBeNull();
  // The card gets the "pointerenter" but not the "pointerleave". In jsdom, nothing matches
  // ":hover", so the pointer is no longer over the card.
  fireEvent.pointerEnter(face!);
  act(() => {
    rerender(renderCard(false));
  });

  expect(animate).not.toHaveBeenCalled();
  waitForBubbleToClose();
  expect(document.querySelector("[data-possible-cards]")).toBeNull();
});

test("the bubble fades out when the card stops showing its holder's view", () => {
  // Holding the pointer down on another player's hand shows what they know about their cards. When
  // the button comes up, each card shows its face again and has no bubble.
  const { container, rerender } = render(renderCard(false));
  const face = container.querySelector("[data-card-face]");
  expect(face).not.toBeNull();
  fireEvent.pointerEnter(face!);
  expect(document.querySelector("[data-possible-cards]")).not.toBeNull();

  act(() => {
    rerender(
      <CardFace
        colorblindMode={false}
        pips={undefined}
        rank={1}
        showPossibleCards={false}
        suitIndex={0}
        variant={getDefaultVariant()}
        width={CARD_RECT.width}
      />,
    );
  });
  expect(document.querySelector("[data-possible-cards]")).not.toBeNull();
  waitForBubbleToClose();
  expect(document.querySelector("[data-possible-cards]")).toBeNull();
});

test.each(["3 Suits", "4 Suits", "No Variant", "6 Suits"])(
  "the suit pips of a card in %s take at most two rows",
  (variantName) => {
    // Every suit and every rank is still possible, which is the most pips that a card shows.
    const variant = getVariant(variantName);
    const pips = {
      suits: variant.suits.map((_suit, i) => ({
        suitIndex: i as SuitIndex,
        eliminated: false,
        positive: false,
      })),
      ranks: variant.ranks.map((rank: Rank) => ({
        rank,
        eliminated: false,
        positive: false,
      })),
      bubble: undefined,
    } as const satisfies CardPipsView;
    const { container } = render(
      <CardFace
        colorblindMode={false}
        pips={pips}
        rank={undefined}
        showPossibleCards={false}
        suitIndex={undefined}
        variant={variant}
        width={CARD_RECT.width}
      />,
    );

    const rows = [...container.querySelectorAll("[data-suit-row]")];
    expect(rows.length).toBeGreaterThan(0);
    expect(rows.length).toBeLessThanOrEqual(2);
    expect(rows.reduce((count, row) => count + row.children.length, 0)).toBe(
      variant.suits.length,
    );
  },
);
