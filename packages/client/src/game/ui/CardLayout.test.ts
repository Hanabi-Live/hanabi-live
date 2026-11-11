import { describe, expect, test, vi } from "vitest";

import type { LayoutChild } from "./LayoutChild.ts";

vi.mock("./UIGlobals.ts", () => ({ globals: {} }));
vi.mock("./misplayAnimation.ts", () => ({}));
const { CardLayout } = await import("./CardLayout.ts");

describe("CardLayout.setEmpathy", () => {
  test("uses the stored card when the first Konva child is not a card", () => {
    const setEmpathy = vi.fn();
    const layoutChild = {
      card: { setEmpathy },
      children: [{}],
    } as unknown as LayoutChild;
    const layout = {
      empathy: false,
      children: [layoutChild],
    } as unknown as InstanceType<typeof CardLayout>;

    expect(() => {
      CardLayout.prototype.setEmpathy.call(layout, true);
    }).not.toThrow();
    expect(setEmpathy).toHaveBeenCalledWith(true);
    expect(layout.empathy).toBe(true);
  });
});
