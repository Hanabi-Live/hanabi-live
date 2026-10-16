import { describe, expect, test } from "@jest/globals";
import { isReconnectRequest } from "./connectionMode";

describe("WebSocket reconnect query", () => {
  test.each([
    ["/ws", false],
    ["/ws?reconnect=1", true],
    ["/ws?reconnect=0", false],
    ["/ws?reconnect=true", false],
    ["/ws?foo=bar&reconnect=1", true],
  ])("%s -> %s", (url, expected) => {
    expect(isReconnectRequest(url)).toBe(expected);
  });
});
