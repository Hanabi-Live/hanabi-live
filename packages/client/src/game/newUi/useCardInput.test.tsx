// @vitest-environment jsdom

import { cleanup, render } from "@testing-library/react";
import { useRef } from "react";
import { afterEach, expect, test, vi } from "vitest";
import type { CardInput } from "./useCardInput.ts";
import { useCardInput } from "./useCardInput.ts";

vi.mock("../../modals.ts", () => ({}));

afterEach(cleanup);

function Screen({ onCardMenu }: { readonly onCardMenu: () => void }) {
  const input = useRef<CardInput>(undefined);
  return (
    <div {...useCardInput(input)}>
      <div data-card-order="0" onContextMenu={onCardMenu}>
        card
      </div>
    </div>
  );
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
