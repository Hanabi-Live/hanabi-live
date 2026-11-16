// @vitest-environment jsdom

import { getVariant } from "@hanabi-live/game";
import { cleanup, render } from "@testing-library/react";
import { afterEach, expect, test, vi } from "vitest";

vi.mock("../../modals.ts", () => ({
  isModalVisible: () => false,
}));
const { ClueMenu } = await import("./ClueMenu.tsx");

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

test("the page scrolls only after the drawer is above the hand", () => {
  // The hand is at the bottom of the table, so the drawer fits only above it.
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
  // The "jsdom" library does not scroll.
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
          reducedMotion
          variant={getVariant("No Variant")}
        />
      </div>
    </main>,
  );

  expect(drawerPlaces).toStrictEqual(["above"]);
});
