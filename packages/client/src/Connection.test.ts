import { describe, expect, test } from "@jest/globals";
import { Connection } from "./Connection";

describe("WebSocket resume safety", () => {
  test("resume probes stay inert and normal commands work without randomUUID", () => {
    // eslint-disable-next-line unicorn/no-unnecessary-global-this
    const originalWebSocket = globalThis.WebSocket;
    const originalRandomUUID = Object.getOwnPropertyDescriptor(
      crypto,
      "randomUUID",
    );
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
    Object.defineProperty(crypto, "randomUUID", {
      configurable: true,
      value: undefined,
    });
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
      initial.send("action", { tableID: 123, type: 0, target: 1 });
      initial.send("action", { tableID: 123, type: 0, target: 1 });
      const first = sockets[1]?.sent[1];
      const second = sockets[1]?.sent[2];
      expect(first).toMatch(/"requestID":"[\d\-a-f]+"/u);
      expect(second).not.toBe(first);
      const retry = { tableID: 123, requestID: "original-request" };
      initial.send("pause", retry);
      initial.send("pause", retry);
      expect(sockets[1]?.sent[3]).toBe(sockets[1]?.sent[4]);
      expect(sockets[1]?.sent[3]).toContain("original-request");
      initial.send("tagDelete", { tableID: 123, msg: "private tag" });
      expect(sockets[1]?.sent[5]).toMatch(/"requestID":"[\da-f]{32}"/u);
    } finally {
      globalThis.WebSocket = originalWebSocket;
      if (originalRandomUUID === undefined) {
        Reflect.deleteProperty(crypto, "randomUUID");
      } else {
        Object.defineProperty(crypto, "randomUUID", originalRandomUUID);
      }
    }
  });
});
