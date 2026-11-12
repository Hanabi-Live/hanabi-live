// @vitest-environment jsdom

import { act, cleanup, fireEvent, render } from "@testing-library/react";
import { afterEach, beforeAll, expect, test, vi } from "vitest";
import { TOOLTIP_DELAY_IN_MILLISECONDS } from "./Tooltip.ts";
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

function Button({
  text,
  instant = true,
}: {
  readonly text: string;
  readonly instant?: boolean;
}) {
  return (
    <button ref={tooltipRef(text, { instant })} type="button">
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

test("a tooltip waits for the pointer to rest on its element", () => {
  vi.useFakeTimers();
  try {
    const { getByRole } = render(<Button instant={false} text="One" />);
    const button = getByRole("button");

    // The pointer passes over the button.
    fireEvent.pointerEnter(button);
    vi.advanceTimersByTime(TOOLTIP_DELAY_IN_MILLISECONDS - 1);
    fireEvent.pointerLeave(button);
    vi.advanceTimersByTime(TOOLTIP_DELAY_IN_MILLISECONDS);
    expect(getBubble()).toBeNull();

    // The pointer rests on the button.
    fireEvent.pointerEnter(button);
    vi.advanceTimersByTime(TOOLTIP_DELAY_IN_MILLISECONDS);
    expect(openElements.has(getBubble()!)).toBe(true);
  } finally {
    vi.useRealTimers();
  }
});
