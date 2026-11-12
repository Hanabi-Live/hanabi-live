import { describe, expect, test } from "vitest";
import { Connection } from "./Connection.ts";

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
    const originalRandomUuid = Object.getOwnPropertyDescriptor(
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
        tableId: 123,
        action: { type: "play", order: 1 },
      });
      expect(sockets[0]?.sent[1]).toBe(
        '{"id":2,"type":"playerAction","data":{"tableId":123,"action":{"type":"play","order":1}}}',
      );
      initial.setReady(false);
      initial.send("playerAction", {
        tableId: 123,
        action: { type: "play", order: 1 },
      });
      expect(sockets[0]?.sent).toHaveLength(2);
      initial.send("gameStateLoad", { tableId: 123 });
      expect(sockets[0]?.sent).toHaveLength(3);
      initial.setReady(true);
      initial.send("playerAction", {
        tableId: 123,
        action: { type: "play", order: 1 },
      });
      expect(sockets[0]?.sent).toHaveLength(4);
    } finally {
      globalThis.WebSocket = originalWebSocket;
      if (originalRandomUuid === undefined) {
        Reflect.deleteProperty(crypto, "randomUUID");
      } else {
        Object.defineProperty(crypto, "randomUUID", originalRandomUuid);
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
      for (const data of [
        { message: "Careful" },
        { message: "" },
        { text: "Careful" },
      ]) {
        conn.onMessage({
          data: JSON.stringify({ event: "warning", data }),
        } as MessageEvent);
      }
      expect(warnings).toEqual([{ message: "Careful" }]);
      expect(Object.isFrozen(warnings[0])).toBe(false);
      expect(invalid).toEqual(["warning", "warning"]);
    } finally {
      globalThis.WebSocket = originalWebSocket;
    }
  });
});

describe("replies", () => {
  test("a request gets its reply, and a refusal shows unless it is ignored", () => {
    // eslint-disable-next-line unicorn/no-unnecessary-global-this
    const originalWebSocket = globalThis.WebSocket;
    globalThis.WebSocket = FakeWebSocket as unknown as typeof WebSocket;
    try {
      const conn = new Connection("ws://localhost/ws", false);
      const warnings: unknown[] = [];
      conn.on("warning", (data) => {
        warnings.push(data);
      });
      const replies = new Map<string, unknown>();
      function reply(frame: object) {
        conn.onMessage({ data: JSON.stringify(frame) } as MessageEvent);
      }

      conn.send("gameHistory", { offset: 0, limit: 10 }, (answer) => {
        replies.set("history", answer);
      });
      conn.send(
        "tableStart",
        { tableId: 1, intendedPlayerIds: [] },
        (answer) => {
          replies.set("refused", answer);
        },
      );
      conn.send("tableLeave", { tableId: 1 }, (answer) => {
        replies.set("ignored", answer);
      });
      conn.send("tableLeave", { tableId: 2 }, (answer) => {
        replies.set("unanswered", answer);
      });
      reply({ reply: 1, data: { games: [], total: 0 } });
      reply({ reply: 2, error: { message: "Not your table." } });
      reply({
        reply: 3,
        error: { message: "Unknown table", code: "commandIgnored" },
      });
      conn.onClose({} as CloseEvent);

      expect(Object.fromEntries(replies)).toEqual({
        history: { ok: true, data: { games: [], total: 0 } },
        refused: { ok: false },
        ignored: { ok: false },
        unanswered: { ok: false },
      });
      expect(warnings).toEqual([{ message: "Not your table." }]);
    } finally {
      globalThis.WebSocket = originalWebSocket;
    }
  });
});
