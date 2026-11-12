// @vitest-environment jsdom

import { act, cleanup, fireEvent, render } from "@testing-library/react";
import { afterEach, beforeAll, expect, test } from "vitest";
import { tooltipRef } from "./tooltipRef.ts";

// The "jsdom" library does not open popovers.
const openElements = new WeakSet<Element>();
beforeAll(() => {
  Object.assign(HTMLElement.prototype, {
    showPopover(this: HTMLElement) {
      openElements.add(this);
    },
    hidePopover(this: HTMLElement) {
      openElements.delete(this);
    },
    matches(this: HTMLElement, selector: string) {
      return selector === ":popover-open"
        ? openElements.has(this)
        : Element.prototype.matches.call(this, selector);
    },
  });
});

afterEach(cleanup);

function Button({ text }: { readonly text: string }) {
  return (
    <button ref={tooltipRef(text)} type="button">
      Button
    </button>
  );
}

function getBubble() {
  return document.querySelector(".tooltip-bubble");
}

test("an open tooltip stays open when its text changes", async () => {
  const { getByRole, rerender } = render(<Button text="One" />);
  fireEvent.pointerEnter(getByRole("button"));
  expect(openElements.has(getBubble()!)).toBe(true);

  rerender(<Button text="Two" />);
  await act(async () => {
    await Promise.resolve();
  });

  const bubble = getBubble();
  expect(bubble?.textContent).toBe("Two");
  expect(openElements.has(bubble!)).toBe(true);
});

test("a tooltip goes away with its element", async () => {
  const { getByRole, unmount } = render(<Button text="One" />);
  fireEvent.pointerEnter(getByRole("button"));
  expect(getBubble()).not.toBeNull();

  unmount();
  await act(async () => {
    await Promise.resolve();
  });

  expect(getBubble()).toBeNull();
});
