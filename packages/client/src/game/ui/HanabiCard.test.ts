import { describe, expect, mock, test } from "bun:test";

await mock.module("./UIGlobals", () => ({ globals: { activeHover: null } }));
await mock.module("../../tooltips", () => ({}));
await mock.module("../../Globals", () => ({ globals: {} }));
await mock.module("./noteCheckImpossibility", () => ({
  checkNoteImpossibility: mock(),
  possibleCardsFromNoteAndClues: mock(),
}));
await mock.module("./HanabiCardMouse", () => ({
  registerMouseHandlers: mock(),
  setCursor: mock(),
  setEmpathyOnHand: mock(),
}));
await mock.module("./notes", () => ({}));
await mock.module("./LayoutChild", () => ({ LayoutChild: mock() }));
const { HanabiCard } = await import("./HanabiCard");

describe("removeLayoutChildFromParent", () => {
  test("releases a card that is held while it leaves the hand", () => {
    const calls: string[] = [];
    const layout = {
      parent: null,
      x: () => 1,
      y: () => 1,
      off: mock((event: string) => {
        calls.push(`off ${event}`);
      }),
      draggable: mock((value: boolean) => {
        calls.push(`draggable ${value}`);
      }),
    };
    const card = {
      dragging: true,
      layout,
      setEmpathy: mock(),
    } as unknown as InstanceType<typeof HanabiCard>;

    HanabiCard.prototype.removeLayoutChildFromParent.call(card);

    expect(card.dragging).toBe(false);
    // The drag handler must be gone before the drag stops, or the card would be played again.
    expect(calls).toEqual(["off dragend", "draggable false"]);
  });
});
