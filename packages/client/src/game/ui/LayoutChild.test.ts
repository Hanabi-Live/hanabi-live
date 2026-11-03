import { describe, expect, jest, test } from "@jest/globals";
import { LayoutChild } from "./LayoutChild";
import { globals } from "./UIGlobals";

jest.mock("./UIGlobals", () => ({ globals: {} }));
jest.mock("../../modals", () => ({}));
jest.mock("../../sounds", () => ({}));
jest.mock("./checkMisplay", () => ({}));
jest.mock("./cursor", () => ({}));
jest.mock("./isOurTurn", () => ({}));
jest.mock("./turn", () => ({}));

describe("LayoutChild initialization without a pointer", () => {
  test.each([undefined, { x: 10, y: 20 }])(
    "updates drag state with pointer %p",
    (pointer) => {
      const shape = {};
      const getIntersection = jest.fn(
        (_pointer: Readonly<{ x: number; y: number }>) => shape,
      );
      const setCursor = jest.fn();
      const draggable = jest.fn();
      const child = {
        shouldBeDraggable: () => true,
        draggable,
        on: jest.fn(),
        off: jest.fn(),
        dragEnd: jest.fn(),
        card: { isAncestorOf: () => true, setCursor },
      } as unknown as LayoutChild;
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
