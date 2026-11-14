import type { Mock } from "vitest";
import { expect, test, vi } from "vitest";
import type { HanabiCard } from "./HanabiCard.ts";

vi.mock("./UiGlobals.ts", () => ({
  globals: {},
}));
vi.mock("./HanabiCardMouse.ts", () => ({ setEmpathyOnHand: vi.fn() }));
const mouse = await import("./HanabiCardMouse.ts");
const { changeStartingHandVisibility } = await import("./hypotheticalHands.ts");
const { globals } = await import("./UiGlobals.ts");

test("uses the LayoutChild card when its first Konva child is not a card", () => {
  const card = {
    state: {
      location: 0,
    },
  } as unknown as HanabiCard;
  const hand = {
    children: [
      {
        card,
        children: [{ isDecoration: true }],
      },
    ],
  };
  Object.assign(globals, {
    elements: {
      playerHands: [hand, { children: [] }],
    },
    options: {
      numPlayers: 2,
    },
    state: {
      replay: {
        hypothetical: {
          startingPlayerIndex: 0,
          showDrawnCards: false,
        },
      },
    },
  });

  changeStartingHandVisibility();

  const empathyCalls = (
    mouse.setEmpathyOnHand as unknown as Mock<typeof mouse.setEmpathyOnHand>
  ).mock.calls;
  expect(empathyCalls).toHaveLength(1);
  expect(empathyCalls[0]).toEqual([card, true]);
});
