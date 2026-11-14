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

function getOpenTexts(): ReadonlyArray<string | null> {
  return [...document.querySelectorAll(".tooltip-bubble")]
    .filter((bubble) => openElements.has(bubble))
    .map((bubble) => bubble.textContent);
}

test("an open tooltip stays open when its text changes", async () => {
  const { rerender, getByRole } = render(<Button text="One" />);
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
  const { unmount, getByRole } = render(<Button text="One" />);
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

test("only the innermost of nested tooltips opens", () => {
  const { getByRole } = render(
    <div ref={tooltipRef("Outer", { instant: true })}>
      <Button text="Inner" />
    </div>,
  );
  const outer = getByRole("button").parentElement!;

  // The pointer enters the outer element, then the inner one.
  fireEvent.pointerEnter(outer);
  expect(getOpenTexts()).toStrictEqual(["Outer"]);
  fireEvent.pointerEnter(getByRole("button"));
  expect(getOpenTexts()).toStrictEqual(["Inner"]);

  // The outer tooltip does not open over the inner one.
  fireEvent.pointerEnter(outer);
  expect(getOpenTexts()).toStrictEqual(["Inner"]);
});

test("an outer tooltip stays shut while an inner one waits to open", () => {
  vi.useFakeTimers();
  try {
    const { getByRole } = render(
      <div ref={tooltipRef("Outer")}>
        <Button instant={false} text="Inner" />
      </div>,
    );
    const outer = getByRole("button").parentElement!;

    // The pointer crosses the outer element onto the inner one.
    fireEvent.pointerEnter(outer);
    vi.advanceTimersByTime(TOOLTIP_DELAY_IN_MILLISECONDS / 2);
    fireEvent.pointerEnter(getByRole("button"));
    vi.advanceTimersByTime(TOOLTIP_DELAY_IN_MILLISECONDS / 2);
    expect(getOpenTexts()).toStrictEqual([]);

    vi.advanceTimersByTime(TOOLTIP_DELAY_IN_MILLISECONDS / 2);
    expect(getOpenTexts()).toStrictEqual(["Inner"]);
  } finally {
    vi.useRealTimers();
  }
});
