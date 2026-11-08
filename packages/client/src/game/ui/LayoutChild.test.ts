import { describe, expect, mock, test } from "bun:test";

await mock.module("./UIGlobals", () => ({ globals: {} }));
await mock.module("../../modals", () => ({}));
await mock.module("../../sounds", () => ({}));
await mock.module("./confirmPlay", () => ({ confirmPlay: mock() }));
await mock.module("./cursor", () => ({}));
await mock.module("./isOurTurn", () => ({ isOurTurn: mock() }));
await mock.module("./turn", () => ({}));
const { LayoutChild } = await import("./LayoutChild");
const { globals } = await import("./UIGlobals");

describe("LayoutChild initialization without a pointer", () => {
  test.each([undefined, { x: 10, y: 20 }])(
    "updates drag state with pointer %p",
    (pointer) => {
      const shape = {};
      const getIntersection = mock(
        (_pointer: Readonly<{ x: number; y: number }>) => shape,
      );
      const setCursor = mock();
      const draggable = mock();
      const child = {
        shouldBeDraggable: () => true,
        draggable,
        on: mock(),
        off: mock(),
        dragEnd: mock(),
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
