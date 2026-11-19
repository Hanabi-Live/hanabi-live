// @vitest-environment jsdom

import { getVariant } from "@hanabi-live/game";
import { cleanup, render } from "@testing-library/react";
import { afterEach, beforeEach, expect, test, vi } from "vitest";

vi.mock("../../modals.ts", () => ({
  isModalVisible: () => false,
}));
const { ClueMenu } = await import("./ClueMenu.tsx");

/** A stand-in for jsdom, which has no layout. So nothing changes size. */
class NoResizeObserver {
  readonly observe = vi.fn();
  readonly disconnect = vi.fn();
}

beforeEach(() => {
  vi.stubGlobal("ResizeObserver", NoResizeObserver);
});

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

test.each([
  [false, "right"],
  [true, "below"],
])(
  "the page scrolls only after the drawer is in its place (below: %s)",
  async (below, place) => {
    // The hand is at the bottom of the table, so the drawer to its right moves up to fit. In the
    // phone layout, it opens below anyway, and the page scrolls to show it.
    vi.spyOn(Element.prototype, "getBoundingClientRect").mockImplementation(
      function getRect(this: Element) {
        if (this.tagName === "MAIN") {
          return DOMRect.fromRect({
            y: 0,
            height: 600,
          });
        }
        if (
          this instanceof HTMLElement
          && this.dataset["clueDrawer"] !== undefined
        ) {
          return DOMRect.fromRect({
            y: 0,
            height: 200,
          });
        }
        return DOMRect.fromRect({
          y: 500,
          height: 80,
        });
      },
    );
    const drawerPlaces: Array<string | undefined> = [];
    // The "jsdom" library does not scroll or animate.
    Element.prototype.getAnimations = () => [];
    Element.prototype.scrollIntoView = vi.fn<() => void>(function scroll(
      this: HTMLElement,
    ) {
      drawerPlaces.push(this.dataset["clueDrawer"]);
    });

    render(
      <main>
        <div>
          <ClueMenu
            canGive={false}
            clue={undefined}
            cluePreview={false}
            colorblindMode={false}
            isAllowed={() => true}
            name="Alice"
            onChooseClue={vi.fn<() => void>()}
            onClose={vi.fn<() => void>()}
            onGive={vi.fn<() => void>()}
            onShowActions={vi.fn<() => void>()}
            onToggleCluePreview={vi.fn<() => void>()}
            openedItself={false}
            phoneLayout={below}
            reducedMotion
            variant={getVariant("No Variant")}
          />
        </div>
      </main>,
    );

    await vi.waitFor(() => {
      expect(drawerPlaces).toStrictEqual([place]);
    });
  },
);
