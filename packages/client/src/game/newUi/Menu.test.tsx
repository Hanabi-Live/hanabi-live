// @vitest-environment jsdom

import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, expect, test, vi } from "vitest";
import { Menu } from "./Menu.tsx";

/** The animations that the menu started, last one last. */
let animations: EventTarget[] = [];

beforeEach(() => {
  animations = [];
  // The "jsdom" library has no animations. An animation here only sends its events.
  Element.prototype.animate = vi.fn(() => {
    const animation = new EventTarget();
    animations.push(animation);
    return animation as Animation;
  });
});

afterEach(() => {
  cleanup();
});

function renderMenu(open: boolean) {
  return (
    <div className="tw:relative">
      <button type="button">Open</button>
      {open && (
        <Menu align="left" className="">
          <button type="button">Item</button>
        </Menu>
      )}
    </div>
  );
}

test("a closed menu leaves a hidden copy that goes when it has faded out", () => {
  const { container, rerender } = render(renderMenu(true));
  expect(screen.getByRole("menu")).toBeDefined();

  rerender(renderMenu(false));
  expect(screen.queryByRole("menu")).toBeNull();
  const copy = container.querySelector('[aria-hidden="true"][inert]');
  expect(copy?.textContent).toBe("Item");

  animations.at(-1)?.dispatchEvent(new Event("finish"));
  expect(copy?.isConnected).toBe(false);
});
