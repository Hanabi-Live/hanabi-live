import { describe, expect, test } from "@jest/globals";
import { Connection } from "./Connection";

describe("WebSocket resume safety", () => {
  test("a reconnect probe never sends gameplay or chat commands", () => {
    // eslint-disable-next-line unicorn/no-unnecessary-global-this
    const originalWebSocket = globalThis.WebSocket;
    const sockets: FakeWebSocket[] = [];

    class FakeWebSocket {
      public static readonly OPEN = 1;
      public readonly readyState = 1;
      public readonly sent: string[] = [];
      public readonly address: string;
      private readonly listeners = new Map<string, unknown>();

      public constructor(address: string) {
        this.address = address;
        sockets.push(this);
      }

      public addEventListener(name: string, listener: unknown) {
        this.listeners.set(name, listener);
      }

      public send(payload: string) {
        this.sent.push(payload);
      }
    }

    globalThis.WebSocket = FakeWebSocket as unknown as typeof WebSocket;
    try {
      const probe = new Connection(
        "ws://localhost/ws?reconnect=1",
        false,
        false,
      );
      probe.send("chat", { room: "table123", msg: "unsafe" });
      expect(sockets[0]?.address).toBe("ws://localhost/ws?reconnect=1");
      expect(sockets[0]?.sent).toEqual([]);

      const initial = new Connection("ws://localhost/ws", false);
      initial.send("chat", { room: "lobby", msg: "allowed" });
      expect(sockets[1]?.sent).toHaveLength(1);
    } finally {
      globalThis.WebSocket = originalWebSocket;
    }
  });
});
