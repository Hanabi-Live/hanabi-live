import { describe, expect, jest, test } from "@jest/globals";
import { CardLayout } from "./CardLayout";
import type { LayoutChild } from "./LayoutChild";

jest.mock("./UIGlobals", () => ({ globals: {} }));

describe("CardLayout.setEmpathy", () => {
  test("uses the stored card when the first Konva child is not a card", () => {
    const setEmpathy = jest.fn();
    const layoutChild = {
      card: { setEmpathy },
      children: [{}],
    } as unknown as LayoutChild;
    const layout = {
      empathy: false,
      children: {
        each: (callback: (child: LayoutChild) => void) => {
          callback(layoutChild);
        },
      },
    } as unknown as CardLayout;

    expect(() => {
      CardLayout.prototype.setEmpathy.call(layout, true);
    }).not.toThrow();
    expect(setEmpathy).toHaveBeenCalledWith(true);
    expect(layout.empathy).toBe(true);
  });
});
