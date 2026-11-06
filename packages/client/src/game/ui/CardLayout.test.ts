import { describe, expect, mock, test } from "bun:test";

import type { LayoutChild } from "./LayoutChild";

await mock.module("./UIGlobals", () => ({ globals: {} }));
const { CardLayout } = await import("./CardLayout");

describe("CardLayout.setEmpathy", () => {
  test("uses the stored card when the first Konva child is not a card", () => {
    const setEmpathy = mock();
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
    } as unknown as InstanceType<typeof CardLayout>;

    expect(() => {
      CardLayout.prototype.setEmpathy.call(layout, true);
    }).not.toThrow();
    expect(setEmpathy).toHaveBeenCalledWith(true);
    expect(layout.empathy).toBe(true);
  });
});
