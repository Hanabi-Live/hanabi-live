import { describe, expect, test, vi } from "vitest";

vi.mock("./UIGlobals", () => ({ globals: { activeHover: null } }));
vi.mock("../../tooltips", () => ({}));
vi.mock("../../Globals", () => ({ globals: {} }));
vi.mock("./noteCheckImpossibility", () => ({
  checkNoteImpossibility: vi.fn(),
  possibleCardsFromNoteAndClues: vi.fn(),
}));
vi.mock("./HanabiCardMouse", () => ({
  registerMouseHandlers: vi.fn(),
  setCursor: vi.fn(),
  setEmpathyOnHand: vi.fn(),
}));
vi.mock("./notes", () => ({}));
vi.mock("./LayoutChild", () => ({ LayoutChild: vi.fn() }));
const { HanabiCard } = await import("./HanabiCard");

describe("removeLayoutChildFromParent", () => {
  test("releases a card that is held while it leaves the hand", () => {
    const calls: string[] = [];
    const layout = {
      parent: null,
      x: () => 1,
      y: () => 1,
      off: vi.fn((event: string) => {
        calls.push(`off ${event}`);
      }),
      draggable: vi.fn((value: boolean) => {
        calls.push(`draggable ${value}`);
      }),
    };
    const card = {
      dragging: true,
      layout,
      setEmpathy: vi.fn(),
    } as unknown as InstanceType<typeof HanabiCard>;

    HanabiCard.prototype.removeLayoutChildFromParent.call(card);

    expect(card.dragging).toBe(false);
    // The drag handler must be gone before the drag stops, or the card would be played again.
    expect(calls).toEqual(["off dragend", "draggable false"]);
  });
});
