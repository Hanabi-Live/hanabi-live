// @vitest-environment jsdom

import { getDefaultVariant } from "@hanabi-live/game";
import { cleanup, render } from "@testing-library/react";
import { afterEach, expect, test, vi } from "vitest";
import { Pip } from "./Pip.tsx";

/** Like Safari's `ResizeObserver.observe`: it throws when asked for a size in display pixels. */
function safariObserve(_target: Element, options?: ResizeObserverOptions) {
  if (options?.box === "device-pixel-content-box") {
    throw new TypeError("Type error");
  }
}

/** Like Safari's: it cannot report a size in display pixels. */
class SafariResizeObserver {
  readonly observe = vi.fn(safariObserve);

  readonly disconnect = vi.fn();
}

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

test("a pip shows in a browser without display-pixel sizes", () => {
  vi.stubGlobal("ResizeObserver", SafariResizeObserver);
  vi.stubGlobal("ResizeObserverEntry", {
    prototype: {},
  });
  vi.spyOn(HTMLCanvasElement.prototype, "getContext").mockReturnValue(null);
  const variant = getDefaultVariant();
  const [suit] = variant.suits;
  if (suit === undefined) {
    throw new Error("The variant has no suits.");
  }

  const { container } = render(<Pip size={20} suit={suit} variant={variant} />);

  expect(container.querySelector("img")).not.toBeNull();
});
