import { describe, expect, test, vi } from "vitest";

vi.mock("./UIGlobals", () => ({ globals: {} }));
vi.mock("../../modals", () => ({}));
vi.mock("../../sounds", () => ({}));
vi.mock("./confirmPlay", () => ({ confirmPlay: vi.fn() }));
vi.mock("./cursor", () => ({}));
vi.mock("./reactive/views/draggableView", () => ({
  draggablePlayerIndex: () => 0,
}));
vi.mock("./turn", () => ({}));
const { LayoutChild } = await import("./LayoutChild");
const { globals } = await import("./UIGlobals");

describe("LayoutChild initialization without a pointer", () => {
  test.each([undefined, { x: 10, y: 20 }])(
    "updates drag state with pointer %p",
    (pointer) => {
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
        card: { isAncestorOf: () => true, setCursor },
      } as unknown as InstanceType<typeof LayoutChild>;
      Object.assign(globals, {
        state: { visibleState: { turn: { currentPlayerIndex: 0 } } },
        stage: { getPointerPosition: () => pointer, getIntersection },
      });
      expect(() => {
        LayoutChild.prototype.checkSetDraggable.call(child);
      }).not.toThrow();
      expect(draggable).toHaveBeenCalledWith(true);
      if (pointer === undefined) {
        expect(getIntersection).not.toHaveBeenCalled();
        expect(setCursor).not.toHaveBeenCalled();
      } else {
        expect(getIntersection).toHaveBeenCalledWith(pointer);
        expect(setCursor).toHaveBeenCalledTimes(1);
      }
    },
  );
});
