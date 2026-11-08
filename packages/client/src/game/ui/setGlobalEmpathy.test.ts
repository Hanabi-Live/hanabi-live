import { describe, expect, test, vi } from "vitest";

vi.mock("./UIGlobals", () => ({ globals: {} }));
vi.mock("./hypothetical", () => ({ changeStartingHandVisibility: vi.fn() }));
const { changeStartingHandVisibility } = await import("./hypothetical");
const { setGlobalEmpathy } = await import("./setGlobalEmpathy");
const { globals } = await import("./UIGlobals");

describe("setGlobalEmpathy", () => {
  test("restores the hypothetical starting hand when disabled", () => {
    const setEmpathy = vi.fn();
    Object.assign(globals, {
      globalEmpathyEnabled: true,
      elements: { playerHands: [{ setEmpathy }] },
      state: { replay: { hypothetical: { startingPlayerIndex: 0 } } },
    });

    setGlobalEmpathy(false);

    expect(setEmpathy).toHaveBeenCalledWith(false);
    expect(changeStartingHandVisibility).toHaveBeenCalledOnce();
  });
});
