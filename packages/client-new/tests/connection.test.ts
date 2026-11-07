import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { LobbyConnection } from "../src/connection";
import { createLobbyStore } from "../src/store";
import { welcome } from "./messages";

function gameInit(tableID: number, shadowing = false, ourPlayerIndex = 0) {
  return {
    tableID,
    playerNames: ["Alice", "Bob"],
    ourPlayerIndex,
    spectating: shadowing,
    shadowing,
    replay: false,
    databaseID: -1,
    hasCustomSeed: false,
    seed: "p2v0s1",
    datetimeStarted: "",
    datetimeFinished: "",
    options: {},
    characterAssignments: [],
    characterMetadata: [],
    sharedReplay: false,
    sharedReplayLeader: "",
    sharedReplaySegment: 0,
    sharedReplayEffMod: 0,
    paused: false,
    pausePlayerIndex: -1,
    pauseQueued: false,
  };
}

class Socket extends EventTarget {
  static OPEN = 1;
  static instances: Socket[] = [];
  readyState = 1;
  sent: string[] = [];
  readonly url: string;
  constructor(url: string) {
    super();
    this.url = url;
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
  it("keeps an administrator's downtime reason through the reconnect until dismissed", async () => {
    const store = createLobbyStore();
    const connection = new LobbyConnection(store, vi.fn());
    await connection.checkSession();
    const first = Socket.instances[0];
    if (!first) {
      throw new Error("Missing socket");
    }
    first.receive("welcome", welcome());
    first.receive("restart", {});
    expect(store.getState().downtime).toBeNull();
    first.receive("restart", { message: "Upgrading the database." });
    first.close();
    expect(store.getState().connection).toBe("reconnecting");
    await vi.advanceTimersByTimeAsync(0);
    const second = Socket.instances[1];
    if (!second) {
      throw new Error("Missing reconnect socket");
    }
    second.receive("welcome", welcome());
    expect(store.getState().downtime).toBe("Upgrading the database.");
    connection.dismissDowntime();
    expect(store.getState().downtime).toBeNull();
    connection.stop();
  });

  it("confirms submissions in wire order without attributing their rejection to later preferences", async () => {
    const store = createLobbyStore();
    const connection = new LobbyConnection(store, vi.fn());
    await connection.checkSession();
    const socket = Socket.instances[0];
    if (!socket) {
      throw new Error("Missing socket");
    }
    socket.receive("welcome", welcome());
    connection.setting("volume", 25);
    const failed = vi.fn<(message: string) => void>();
    const accepted = vi.fn<() => void>();
    expect(connection.send("tableJoin", { tableID: 7 }, failed, accepted)).toBe(
      true,
    );
    connection.setting("volume", 30);
    socket.receive("synced", {});
    socket.receive("warning", { warning: "This table is full." });
    socket.receive("synced", {});
    expect(failed).toHaveBeenCalledWith(
      expect.stringContaining("This table is full."),
    );
    expect(accepted).not.toHaveBeenCalled();
    socket.receive("synced", {});
    expect(store.getState().preferenceStatus).toBe("saved");
    expect(connection.send("tableJoin", { tableID: 7 }, failed, accepted)).toBe(
      true,
    );
    socket.receive("joined", { tableID: 7 });
    expect(accepted).not.toHaveBeenCalled();
    socket.receive("synced", {});
    expect(accepted).toHaveBeenCalledOnce();
    connection.stop();
  });

  it("does not duplicate or claim success for an unconfirmed submission", async () => {
    const store = createLobbyStore();
    const connection = new LobbyConnection(store, vi.fn());
    await connection.checkSession();
    const socket = Socket.instances[0];
    if (!socket) {
      throw new Error("Missing socket");
    }
    socket.receive("welcome", welcome());
    const failed = vi.fn<(message: string) => void>();
    const accepted = vi.fn<() => void>();
    expect(connection.send("tableJoin", { tableID: 7 }, failed, accepted)).toBe(
      true,
    );
    expect(
      connection.send(
        "tableJoin",
        { tableID: 7 },
        vi.fn<(message: string) => void>(),
        accepted,
      ),
    ).toBe(false);
    await vi.advanceTimersByTimeAsync(11_000);
    expect(failed).toHaveBeenCalledWith(
      expect.stringContaining("may have succeeded"),
    );
    expect(failed).toHaveBeenCalledOnce();
    expect(accepted).not.toHaveBeenCalled();
    expect(
      Socket.instances
        .flatMap((instance) => instance.sent)
        .filter((frame) => frame.startsWith("tableJoin ")),
    ).toHaveLength(1);
    connection.stop();
  });

  it("forgets a removed table without leaving another table or reattending the removed one", async () => {
    const store = createLobbyStore();
    const connection = new LobbyConnection(store, vi.fn());
    await connection.checkSession();
    const socket = Socket.instances[0];
    if (!socket) {
      throw new Error("Missing socket");
    }
    socket.receive("welcome", { ...welcome(), playingAtTables: [7, 9] });
    socket.receive("joined", { tableID: 7 });
    socket.receive("left", { tableID: 9 });
    expect(store.getState().tableID).toBe(7);
    socket.receive("boot", { TableID: 9 });
    expect(store.getState().tableID).toBe(7);
    expect(store.getState().welcome?.playingAtTables).toEqual([7]);
    socket.receive("boot", { TableID: 7 });
    expect(store.getState().tableID).toBeNull();
    expect(store.getState().welcome?.playingAtTables).toEqual([]);
    socket.close();
    await vi.advanceTimersByTimeAsync(1000);
    const reconnected = Socket.instances[1];
    reconnected?.receive("welcome", welcome());
    expect(reconnected?.sent).not.toContain('tableReattend {"tableID":7}');
    connection.stop();
  });

  it.each(["boot", "left", "tableGone"] as const)(
    "cancels authoritative game handoff when %s revokes its table",
    async (command) => {
      const store = createLobbyStore();
      const navigate = vi.fn(() => true);
      const connection = new LobbyConnection(store, navigate);
      await connection.checkSession();
      const socket = Socket.instances[0];
      if (!socket) {
        throw new Error("Missing socket");
      }
      socket.receive("welcome", welcome());
      socket.receive("tableStart", { tableID: 7, replay: false });
      socket.receive(
        command,
        command === "boot" ? { TableID: 7 } : { tableID: 7 },
      );
      socket.receive("init", gameInit(7, true, 0));
      expect(navigate).not.toHaveBeenCalled();
      connection.stop();
    },
  );

  it("sends the client version on initial connection and reconnect, then stops on rejection", async () => {
    const store = createLobbyStore();
    const connection = new LobbyConnection(store, () => true);
    await connection.checkSession();
    const socket = Socket.instances[0];
    expect(socket?.url).toBe(
      `ws://localhost/ws?version=${encodeURIComponent(CLIENT_VERSION)}`,
    );
    socket?.receive("welcome", welcome());
    socket?.close();
    await vi.advanceTimersByTimeAsync(1000);
    const reconnected = Socket.instances[1];
    expect(reconnected?.url).toBe(socket?.url);
    reconnected?.receive("error", {
      error: "Outdated client. Please hard-refresh.",
    });
    await vi.advanceTimersByTimeAsync(30_000);
    expect(store.getState().notice?.text).toContain("hard-refresh");
    expect(store.getState().connection).toBe("stopped");
    expect(Socket.instances).toHaveLength(2);
    connection.stop();
  });

  it("reports the invalid request field to both the form and global notice", async () => {
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
    const failed = vi.fn<(message: string) => void>();
    expect(
      connection.send("historyGet", { offset: "bad", amount: 10 }, failed),
    ).toBe(false);
    expect(socket.sent).toEqual([]);
    expect(store.getState().notice?.text).toContain("offset");
    expect(store.getState().notice?.text).toContain("number");
    expect(failed).toHaveBeenCalledWith(store.getState().notice?.text);
    connection.stop();
  });

  it("preserves logout HTTP failure explanations", async () => {
    const store = createLobbyStore();
    const connection = new LobbyConnection(
      store,
      vi.fn(() => true),
    );
    vi.mocked(fetch).mockResolvedValueOnce(
      new Response("Database maintenance [Reference: abc123]", { status: 503 }),
    );
    await connection.logout();
    expect(store.getState().notice?.text).toContain("HTTP 503");
    expect(store.getState().notice?.text).toContain("Database maintenance");
    expect(store.getState().notice?.text).toContain("Reference: abc123");
  });

  it("retries a transient first session check without discarding authentication", async () => {
    const store = createLobbyStore();
    const connection = new LobbyConnection(store, () => true);
    vi.mocked(fetch).mockResolvedValueOnce(new Response(null, { status: 503 }));
    await connection.checkSession();
    expect(store.getState().connection).toBe("reconnecting");
    await vi.advanceTimersByTimeAsync(1);
    expect(Socket.instances).toHaveLength(1);
    connection.stop();
  });

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
    expect(socket.sent).toEqual([
      'setting {"name":"volume","setting":"0"}',
      "sync {}",
      'setting {"name":"volume","setting":"3"}',
      "sync {}",
    ]);
    expect(store.getState().preferenceStatus).toBe("saving");
    socket.receive("synced", {});
    expect(store.getState().preferenceStatus).toBe("saving");
    socket.receive("tableStart", { tableID: 1, replay: false });
    socket.receive("init", gameInit(1));
    expect(navigate).not.toHaveBeenCalled();
    socket.receive("synced", {});
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
    socket.receive("synced", {});
    expect(store.getState().preferenceStatus).toBe("failed");
    connection.setting("volume", 5);
    socket.close();
    expect(store.getState().preferenceStatus).toBe("failed");
    connection.stop();
  });

  it("uses the authoritative shuffled shadow seat when handing off to the game", async () => {
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
    expect(socket.sent.at(-1)).toBe('getGameInfo1 {"tableID":1}');
    expect(navigate).not.toHaveBeenCalled();
    socket.receive("init", gameInit(2, true, 1));
    expect(navigate).not.toHaveBeenCalled();
    socket.receive("init", gameInit(1, true, 0));
    expect(navigate).toHaveBeenCalledWith({
      kind: "table",
      tableID: 1,
      shadowingPlayerIndex: 0,
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

  it("does not enter a game after leaving while authoritative handoff data is pending", async () => {
    const store = createLobbyStore();
    const navigate = vi.fn(() => true);
    const connection = new LobbyConnection(store, navigate);
    await connection.checkSession();
    const socket = Socket.instances[0];
    if (!socket) {
      throw new Error("Missing socket");
    }
    socket.receive("welcome", welcome());
    socket.receive("tableStart", { tableID: 1, replay: false });
    connection.send("tableUnattend", { tableID: 1 });
    socket.receive("init", gameInit(1, true, 0));
    expect(navigate).not.toHaveBeenCalled();
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
