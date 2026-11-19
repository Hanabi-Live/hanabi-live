import { VERSION } from "@hanabi-live/data";
import type { Clock } from "@sinonjs/fake-timers";
import { install } from "@sinonjs/fake-timers";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { LocalStorageStub } from "./testLocalStorage.ts";

let clock: Clock;

vi.mock("./Globals.ts", () => ({
  globals: {
    conn: undefined,
    currentScreen: "Login",
    ui: undefined,
  },
}));
vi.mock("./commands.ts", () => ({
  commands: new Map([["error", vi.fn()]]),
}));
vi.mock("./lobby/lobbyCommands.ts", () => ({
  lobbyCommands: new Map([["welcome", vi.fn()]]),
}));
vi.mock("./game/gameCommands.ts", () => ({
  gameCommands: new Map(),
}));
vi.mock("./modals.ts", () => ({ showError: vi.fn() }));
vi.mock("./game/main.ts", () => ({ closeGame: vi.fn() }));
const { globals } = await import("./Globals.ts");
const { commands } = await import("./commands.ts");
const { Connection } = await import("./Connection.ts");
const { websocketInit } = await import("./websocketInit.ts");
const { store } = await import("./store.ts");

interface FakeSocket {
  url: string;
  readyState: number;
  closed: boolean;
  emit: (event: string) => void;
}

const sockets: FakeSocket[] = [];
const reload = vi.fn();

class MockSocket {
  static readonly CONNECTING = 0;
  static readonly OPEN = 1;
  static readonly CLOSED = 3;
  private readonly listeners = new Map<string, () => void>();

  readonly url: string;
  readyState = MockSocket.CONNECTING;
  closed = false;

  constructor(url: string) {
    this.url = url;
    sockets.push(this);
  }

  addEventListener(event: string, listener: () => void): void {
    this.listeners.set(event, listener);
  }

  emit(event: string): void {
    if (event === "open") {
      this.readyState = MockSocket.OPEN;
    }
    this.listeners.get(event)?.();
  }

  close(): void {
    this.closed = true;
    this.readyState = MockSocket.CLOSED;
    // Deliberately do not emit "close": some stalled connections never do.
  }
}

beforeEach(() => {
  clock = install({
    toFake: [
      "setTimeout",
      "clearTimeout",
      "setInterval",
      "clearInterval",
      "Date",
    ],
  });
  sockets.length = 0;
  vi.clearAllMocks();

  vi.stubGlobal("WebSocket", MockSocket);
  vi.stubGlobal("navigator", { onLine: true });
  vi.stubGlobal("document", {
    visibilityState: "visible",
    addEventListener: vi.fn(),
    querySelector: () => ({ textContent: "localhost" }),
  });
  vi.stubGlobal("location", {
    hostname: "localhost",
    protocol: "https:",
    port: "",
    reload,
  });
  vi.stubGlobal("sessionStorage", new LocalStorageStub());
  vi.stubGlobal("addEventListener", vi.fn());
});

afterEach(() => {
  for (const socket of sockets) {
    socket.readyState = MockSocket.CLOSED;
  }
  clock.uninstall();
  vi.unstubAllGlobals();
});

describe("initial WebSocket handshake watchdog", () => {
  test("recovers a permanently CONNECTING socket without a close event", async () => {
    websocketInit();
    expect(sockets).toHaveLength(1);
    expect(sockets[0]?.url).toBe(
      `wss://localhost/ws?version=${encodeURIComponent(VERSION)}`,
    );

    await clock.tickAsync(14_999);
    expect(sockets).toHaveLength(1);
    await clock.tickAsync(1001);

    expect(sockets[0]?.closed).toBe(true);
    expect(sockets).toHaveLength(2);
    expect(sockets[1]?.url).toBe(
      `wss://localhost/ws?version=${encodeURIComponent(VERSION)}`,
    );
  });

  test("shows an error after failing to connect before the server welcomes the page", async () => {
    websocketInit();
    sockets[0]?.emit("close");
    await clock.tickAsync(1000);
    expect(sockets).toHaveLength(2);
    sockets[1]?.emit("close");
    await clock.tickAsync(1000);
    expect(sockets).toHaveLength(3);
    sockets[2]?.emit("close");

    await clock.tickAsync(30_000);
    expect(sockets).toHaveLength(3);
    expect(store.getState().login.stage).toBe("signIn");
    expect(store.getState().login.alert?.retry).toBe(true);
  });

  test("shows the sign-in form when the session is not valid", async () => {
    websocketInit();
    sockets[0]?.emit("open");
    globals.conn?.callbacks.get("error")?.({
      message: "A valid session is required.",
      code: "signInRequired",
    } as never);
    sockets[0]?.emit("close");

    await clock.tickAsync(30_000);
    expect(store.getState().login.stage).toBe("signIn");
    expect(commands.get("error")).not.toHaveBeenCalled();
    expect(reload).not.toHaveBeenCalled();
    expect(sockets).toHaveLength(1);
  });

  test("reloads when the session ends after the server welcomed the page", () => {
    websocketInit();
    sockets[0]?.emit("open");
    globals.conn?.callbacks.get("welcome")?.({} as never);
    globals.conn?.callbacks.get("error")?.({
      message: "This session has ended.",
      code: "signInRequired",
    } as never);

    expect(reload).toHaveBeenCalledTimes(1);
  });

  test("clears handshake timers after open and welcome", async () => {
    websocketInit();

    sockets[0]?.emit("open");
    globals.conn?.callbacks.get("welcome")?.({} as never);

    await clock.tickAsync(30_000);
    expect(sockets).toHaveLength(1);
    expect(sockets[0]?.closed).toBe(false);
  });

  test("shows version rejection without retrying the connection", async () => {
    websocketInit();
    sockets[0]?.emit("open");
    const error = { message: "Outdated client. Please hard-refresh." };
    globals.conn?.callbacks.get("error")?.(error as never);
    sockets[0]?.emit("close");

    await clock.tickAsync(30_000);
    expect(commands.get("error")).toHaveBeenCalledWith(error);
    expect(sockets).toHaveLength(1);
  });

  test("reloads an outdated client once per client version", async () => {
    websocketInit();
    sockets[0]?.emit("open");
    const error = {
      message: "Outdated client.",
      code: "outdatedClient",
    };
    globals.conn?.callbacks.get("error")?.(error as never);
    sockets[0]?.emit("close");

    await clock.tickAsync(30_000);
    expect(reload).toHaveBeenCalledTimes(1);
    expect(commands.get("error")).not.toHaveBeenCalled();
    expect(sockets).toHaveLength(1);

    // A reload that served the same client again must not repeat forever.
    websocketInit();
    sockets[1]?.emit("open");
    globals.conn?.callbacks.get("error")?.(error as never);
    expect(reload).toHaveBeenCalledTimes(1);
  });

  test("keeps reconnecting after maintenance, and reloads when the server is back", async () => {
    const on = vi.spyOn(Connection.prototype, "on");
    websocketInit();
    sockets[0]?.emit("open");
    const error = {
      message: "The server is down.",
      code: "maintenance",
    };
    globals.conn?.callbacks.get("error")?.(error as never);
    sockets[0]?.emit("close");
    expect(commands.get("error")).toHaveBeenCalledWith(error);

    await clock.tickAsync(500);
    expect(sockets).toHaveLength(2);
    expect(reload).not.toHaveBeenCalled();

    sockets[1]?.emit("open");
    // The connection that reconnected registered the last callback.
    const reconnected = on.mock.contexts.at(-1) as
      InstanceType<typeof Connection> | undefined;
    reconnected?.callbacks.get("welcome")?.({} as never);
    expect(reload).toHaveBeenCalledTimes(1);
    on.mockRestore();
  });

  test("recovers a socket opened without a welcome", async () => {
    websocketInit();
    sockets[0]?.emit("open");

    await clock.tickAsync(16_000);
    expect(sockets[0]?.closed).toBe(true);
    expect(sockets).toHaveLength(2);
  });
});
