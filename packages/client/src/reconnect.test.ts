import { describe, expect, test, vi } from "vitest";
import { ReconnectBackoff } from "./reconnect.ts";

describe("WebSocket reconnect backoff", () => {
  test("retries immediately, then adds bounded jitter with a thirty-second cap", () => {
    const policy = new ReconnectBackoff();
    const random = vi.spyOn(Math, "random").mockReturnValue(0.5);
    try {
      expect(Array.from({ length: 10 }, () => policy.nextDelay())).toEqual([
        0, 150, 300, 600, 1200, 2400, 4800, 9600, 19_200, 22_500,
      ]);
    } finally {
      random.mockRestore();
    }
  });

  test("a fresh connection clears previous delays", () => {
    const policy = new ReconnectBackoff();
    policy.nextDelay();
    policy.nextDelay();
    policy.reset();
    expect(policy.nextDelay()).toBe(0);
  });
});
