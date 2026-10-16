import { describe, expect, test } from "@jest/globals";
import { ReconnectBackoff } from "./reconnect";

describe("WebSocket reconnect backoff", () => {
  test("starts fast, grows exponentially, and caps at thirty seconds", () => {
    const policy = new ReconnectBackoff();
    expect(Array.from({ length: 8 }, () => policy.nextDelay())).toEqual([
      1000, 2000, 4000, 8000, 16_000, 30_000, 30_000, 30_000,
    ]);
  });

  test("a fresh connection clears previous delays", () => {
    const policy = new ReconnectBackoff();
    policy.nextDelay();
    policy.nextDelay();
    policy.reset();
    expect(policy.nextDelay()).toBe(1000);
  });
});
