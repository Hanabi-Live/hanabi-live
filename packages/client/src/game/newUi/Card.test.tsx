// @vitest-environment jsdom

import { getDefaultVariant } from "@hanabi-live/game";
import { act, cleanup, fireEvent, render } from "@testing-library/react";
import { afterEach, beforeEach, expect, test, vi } from "vitest";
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
    inexact: false,
  },
} as const satisfies CardPipsView;

function renderCard(trash: boolean) {
  return (
    <CardFace
      colorblindMode={false}
      pips={PIPS}
      rank={undefined}
      showPossibleCards
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

beforeEach(() => {
  vi.stubGlobal("ResizeObserver", NoResizeObserver);
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
});

test("the bubble stays at the card when the card stops being trash", () => {
  // Holding the pointer down on a hand shows its holder's view, where a card that is trash may not
  // be. Then the card's face leaves the wrapper of a trash card, and is a new element.
  const { container, rerender } = render(renderCard(true));
  const face = container.querySelector("[data-card-face]");
  expect(face).not.toBeNull();
  fireEvent.pointerEnter(face!);
  act(() => {
    rerender(renderCard(false));
  });

  const bubble = document.querySelector("[data-possible-cards]");
  expect((bubble?.parentElement as HTMLElement | null)?.style.left).toBe(
    `${CARD_RECT.left + CARD_RECT.width / 2}px`,
  );
});
