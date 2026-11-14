import { describe, expect, test, vi } from "vitest";

vi.mock("./UiGlobals.ts", () => ({
  globals: {},
}));
vi.mock("../../modals.ts", () => ({}));
vi.mock("../../sounds.ts", () => ({}));
vi.mock("./confirmPlay.ts", () => ({ confirmPlay: vi.fn() }));
vi.mock("./cursor.ts", () => ({}));
vi.mock("./reactive/views/draggableView.ts", () => ({
  draggablePlayerIndex: () => 0,
}));
vi.mock("./turn.ts", () => ({}));
const { LayoutChild } = await import("./LayoutChild.ts");
const { globals } = await import("./UiGlobals.ts");

describe("LayoutChild initialization without a pointer", () => {
  test.each([
    null,
    {
      x: 10,
      y: 20,
    },
  ])("updates drag state with pointer %p", (pointer) => {
    const shape = {};
    const getIntersection = vi.fn(
      (_pointer: Readonly<{ x: number; y: number }>) => shape,
    );
    const setCursor = vi.fn();
    const draggable = vi.fn();
    const child = {
      shouldBeDraggable: () => true,
      draggable,
      on: vi.fn(),
      off: vi.fn(),
      dragEnd: vi.fn(),
      card: {
        isAncestorOf: () => true,
        setCursor,
      },
    } as unknown as InstanceType<typeof LayoutChild>;
    Object.assign(globals, {
      state: {
        visibleState: {
          turn: {
            currentPlayerIndex: 0,
          },
        },
      },
      stage: {
        getPointersPositions: () => (pointer === null ? [] : [pointer]),
        getPointerPosition: () => pointer,
        getIntersection,
      },
    });
    expect(() => {
      LayoutChild.prototype.checkSetDraggable.call(child);
    }).not.toThrow();
    expect(draggable).toHaveBeenCalledWith(true);
    if (pointer === null) {
      expect(getIntersection).not.toHaveBeenCalled();
      expect(setCursor).not.toHaveBeenCalled();
    } else {
      expect(getIntersection).toHaveBeenCalledWith(pointer);
      expect(setCursor).toHaveBeenCalledTimes(1);
    }
  });
});
