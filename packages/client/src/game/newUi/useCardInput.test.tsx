// @vitest-environment jsdom

import { cleanup, render } from "@testing-library/react";
import { useRef } from "react";
import { afterEach, expect, test, vi } from "vitest";
import { LONG_PRESS_MILLISECONDS } from "./cardClicks.ts";
import type { CardInput } from "./useCardInput.ts";
import { useCardInput } from "./useCardInput.ts";

vi.mock("../../modals.ts", () => ({}));

afterEach(cleanup);

function Screen({
  onCardMenu,
  onCardTap,
}: {
  readonly onCardMenu?: () => void;
  readonly onCardTap?: () => void;
}) {
  const input = useRef<CardInput>(undefined);
  return (
    <div {...useCardInput(input)}>
      <div data-card-order="0" onClick={onCardTap} onContextMenu={onCardMenu}>
        card
      </div>
    </div>
  );
}

/** Sends a pointer event of a touch at a time, in milliseconds. */
function sendTouch(element: Element, type: string, time: number) {
  const event = new MouseEvent(type, {
    bubbles: true,
    cancelable: true,
  });
  Object.defineProperties(event, {
    pointerType: {
      value: "touch",
    },
    timeStamp: {
      value: time,
    },
  });
  element.dispatchEvent(event);
}

/** Sends the menu event that a right-click or a long touch makes, and says if it went through. */
function openMenu(element: Element, pointerType: string) {
  const event = new MouseEvent("contextmenu", {
    bubbles: true,
    cancelable: true,
  });
  Object.defineProperty(event, "pointerType", { value: pointerType });
  element.dispatchEvent(event);
  return !event.defaultPrevented;
}

test("a long touch on a card does not do what a right-click does", () => {
  const onCardMenu = vi.fn<() => void>();
  const { getByText } = render(<Screen onCardMenu={onCardMenu} />);
  const card = getByText("card");

  expect(openMenu(card, "touch")).toBe(false);
  expect(onCardMenu).not.toHaveBeenCalled();

  openMenu(card, "mouse");
  expect(onCardMenu).toHaveBeenCalledOnce();
});

test("a long touch on a card is not a tap", () => {
  const onCardTap = vi.fn<() => void>();
  const { getByText } = render(<Screen onCardTap={onCardTap} />);
  const card = getByText("card");

  // React reads a time of 0 as no time.
  sendTouch(card, "pointerdown", 1);
  sendTouch(card, "click", 1 + LONG_PRESS_MILLISECONDS);
  expect(onCardTap).not.toHaveBeenCalled();

  sendTouch(card, "pointerdown", 2 * LONG_PRESS_MILLISECONDS);
  sendTouch(card, "click", 2 * LONG_PRESS_MILLISECONDS + 1);
  expect(onCardTap).toHaveBeenCalledOnce();
});
