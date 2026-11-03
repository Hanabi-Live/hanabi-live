import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { LobbyConnection } from "../src/connection";
import { createLobbyStore } from "../src/store";
import { welcome } from "./messages";

class Socket extends EventTarget {
  static OPEN = 1;
  static instances: Socket[] = [];
  readyState = 1;
  sent: string[] = [];
  constructor() {
    super();
    Socket.instances.push(this);
  }

  send(text: string) {
    this.sent.push(text);
  }

  close() {
    this.readyState = 3;
    this.dispatchEvent(new Event("close"));
  }

  receive(command: string, data: unknown) {
    this.dispatchEvent(
      new MessageEvent("message", {
        data: `${command} ${JSON.stringify(data)}`,
      }),
    );
  }
}

beforeEach(() => {
  vi.useFakeTimers();
  Socket.instances = [];
  vi.stubGlobal("WebSocket", Socket);
  vi.stubGlobal("location", { protocol: "http:", host: "localhost" });
  vi.stubGlobal(
    "fetch",
    vi.fn().mockResolvedValue(new Response(null, { status: 200 })),
  );
  vi.spyOn(Math, "random").mockReturnValue(0);
});
afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

describe("connection ownership and recovery", () => {
  it("confirms the latest preference write only after its ordered server barrier", async () => {
    const store = createLobbyStore();
    const navigate = vi.fn(() => true);
    const connection = new LobbyConnection(store, navigate);
    await connection.checkSession();
    const socket = Socket.instances[0];
    if (!socket) {
      throw new Error("Missing socket");
    }
    socket.receive("welcome", welcome());
    connection.setting("volume", 0);
    connection.setting("volume", 3);
    expect(store.getState().preferenceStatus).toBe("saving");
    socket.receive("name", { name: "first acknowledgement" });
    expect(store.getState().preferenceStatus).toBe("saving");
    socket.receive("tableStart", { tableID: 1, replay: false });
    expect(navigate).not.toHaveBeenCalled();
    socket.receive("name", { name: "latest acknowledgement" });
    expect(store.getState().preferenceStatus).toBe("saved");
    expect(navigate).toHaveBeenCalledTimes(1);
    connection.stop();
  });

  it("does not report rejected or disconnected preference writes as saved", async () => {
    const store = createLobbyStore();
    const connection = new LobbyConnection(
      store,
      vi.fn(() => true),
    );
    await connection.checkSession();
    const socket = Socket.instances[0];
    if (!socket) {
      throw new Error("Missing socket");
    }
    socket.receive("welcome", welcome());
    connection.setting("volume", 3);
    socket.receive("warning", { warning: "Setting rejected" });
    socket.receive("name", { name: "barrier" });
    expect(store.getState().preferenceStatus).toBe("failed");
    connection.setting("volume", 5);
    socket.close();
    expect(store.getState().preferenceStatus).toBe("failed");
    connection.stop();
  });

  it("preserves the selected shadow seat when handing off to the game", async () => {
    const store = createLobbyStore();
    const navigate = vi.fn(() => true);
    const connection = new LobbyConnection(store, navigate);
    await connection.checkSession();
    const socket = Socket.instances[0];
    if (!socket) {
      throw new Error("Missing socket");
    }
    socket.receive("welcome", welcome());
    connection.send("tableSpectate", { tableID: 1, shadowingPlayerIndex: 1 });
    socket.receive("tableStart", { tableID: 1, replay: false });
    expect(navigate).toHaveBeenCalledWith({
      kind: "table",
      tableID: 1,
      shadowingPlayerIndex: 1,
    });
    connection.stop();
  });

  it("hands replay creation to the game screen before disconnecting the last viewer", async () => {
    const store = createLobbyStore();
    const navigate = vi.fn(() => true);
    const connection = new LobbyConnection(store, navigate);
    await connection.checkSession();
    const socket = Socket.instances[0];
    if (!socket) {
      throw new Error("Missing socket");
    }
    socket.receive("welcome", welcome());
    expect(
      connection.send("replayCreate", {
        source: "json",
        visibility: "solo",
        gameJSON: { players: ["Alice", "Bob"], seed: "p2v0s1" },
      }),
    ).toBe(true);
    expect(socket.sent).toEqual([]);
    expect(navigate).toHaveBeenCalledWith(
      expect.objectContaining({ kind: "replay" }),
    );
    expect(socket.readyState).toBe(3);
    connection.stop();
  });

  it("fences stale sockets, refreshes authoritative state, and never replays mutations", async () => {
    const store = createLobbyStore();
    const connection = new LobbyConnection(store, vi.fn());
    await connection.checkSession();
    const first = Socket.instances[0];
    if (!first) {
      throw new Error("Missing first socket");
    }
    first.receive("welcome", welcome());
    expect(
      connection.send("chat", {
        msg: "Hello",
        room: "lobby",
        requestID: "original",
      }),
    ).toBe(true);
    expect(first.sent[0]).toContain('"requestID":"original"');
    first.close();
    expect(connection.send("chat", { msg: "Offline", room: "lobby" })).toBe(
      false,
    );
    await vi.advanceTimersByTimeAsync(500);
    const next = Socket.instances[1];
    if (!next) {
      throw new Error("Missing replacement socket");
    }
    next.receive("welcome", welcome());
    first.receive("error", { error: "Old socket failure" });
    expect(store.getState().connection).toBe("online");
    expect(next.sent).toEqual([]);
    connection.stop();
  });

  it("keeps retrying transient cookie failures without showing a signed-out state", async () => {
    vi.spyOn(console, "warn").mockImplementation(() => undefined);
    const store = createLobbyStore();
    const connection = new LobbyConnection(store, vi.fn());
    await connection.checkSession();
    const first = Socket.instances[0];
    if (!first) {
      throw new Error("Missing socket");
    }
    first.receive("welcome", welcome());
    vi.mocked(fetch).mockResolvedValueOnce(new Response(null, { status: 503 }));
    first.close();
    await vi.advanceTimersByTimeAsync(500);
    expect(store.getState().connection).toBe("reconnecting");
    expect(store.getState().welcome?.username).toBe("Alice");
    await vi.advanceTimersByTimeAsync(1000);
    const next = Socket.instances[1];
    if (!next) {
      throw new Error("Missing replacement socket");
    }
    next.receive("welcome", welcome());
    expect(store.getState().connection).toBe("online");
    connection.stop();
  });

  it("stops automatic retries for an explicit server rejection", async () => {
    const store = createLobbyStore();
    const connection = new LobbyConnection(store, vi.fn());
    await connection.checkSession();
    const socket = Socket.instances[0];
    if (!socket) {
      throw new Error("Missing socket");
    }
    socket.receive("welcome", welcome());
    socket.receive("error", { error: "This account connected elsewhere." });
    expect(store.getState().connection).toBe("stopped");
    await vi.advanceTimersByTimeAsync(60_000);
    expect(Socket.instances).toHaveLength(1);
    expect(store.getState().notice?.fatal).toBe(true);
    connection.stop();
  });
});
