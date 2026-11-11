import { describe, expect, test } from "vitest";
import { Connection } from "./Connection";

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

describe("sending commands", () => {
  test("commands wait for readiness and work without randomUUID", () => {
    // eslint-disable-next-line unicorn/no-unnecessary-global-this
    const originalWebSocket = globalThis.WebSocket;
    const originalRandomUUID = Object.getOwnPropertyDescriptor(
      crypto,
      "randomUUID",
    );
    sockets.length = 0;

    globalThis.WebSocket = FakeWebSocket as unknown as typeof WebSocket;
    Object.defineProperty(crypto, "randomUUID", {
      configurable: true,
      value: undefined,
    });
    try {
      const initial = new Connection("ws://localhost/ws", false);
      initial.send("chat", { text: "allowed" });
      expect(sockets[0]?.sent).toHaveLength(1);
      initial.send("playerAction", {
        tableID: 123,
        action: { type: "play", order: 1 },
      });
      expect(sockets[0]?.sent[1]).toBe(
        'playerAction {"tableID":123,"action":{"type":"play","order":1}}',
      );
      initial.setReady(false);
      initial.send("playerAction", {
        tableID: 123,
        action: { type: "play", order: 1 },
      });
      expect(sockets[0]?.sent).toHaveLength(2);
      initial.send("getGameState", { tableID: 123 });
      expect(sockets[0]?.sent).toHaveLength(3);
      initial.setReady(true);
      initial.send("playerAction", {
        tableID: 123,
        action: { type: "play", order: 1 },
      });
      expect(sockets[0]?.sent).toHaveLength(4);
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

describe("received messages", () => {
  test("handlers get validated payloads and invalid ones are reported instead", () => {
    // eslint-disable-next-line unicorn/no-unnecessary-global-this
    const originalWebSocket = globalThis.WebSocket;
    globalThis.WebSocket = FakeWebSocket as unknown as typeof WebSocket;
    try {
      const conn = new Connection("ws://localhost/ws", false);
      const warnings: unknown[] = [];
      const invalid: string[] = [];
      conn.on("warning", (data) => {
        warnings.push(data);
      });
      conn.invalidMessage = (command) => {
        invalid.push(command);
      };
      conn.onMessage({ data: 'warning {"message":"Careful"}' } as MessageEvent);
      conn.onMessage({ data: 'warning {"message":""}' } as MessageEvent);
      conn.onMessage({ data: 'warning {"text":"Careful"}' } as MessageEvent);
      expect(warnings).toEqual([{ message: "Careful" }]);
      expect(Object.isFrozen(warnings[0])).toBe(false);
      expect(invalid).toEqual(["warning", "warning"]);
    } finally {
      globalThis.WebSocket = originalWebSocket;
    }
  });
});
