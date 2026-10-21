import {
  afterEach,
  beforeEach,
  describe,
  expect,
  jest,
  test,
} from "@jest/globals";

jest.mock("./Globals", () => ({
  globals: { conn: null, currentScreen: "Login", ui: null },
}));
jest.mock("./commands", () => ({ commands: new Map() }));
jest.mock("./lobby/lobbyCommands", () => ({
  lobbyCommands: new Map([["welcome", jest.fn()]]),
}));
jest.mock("./game/ui/gameCommands", () => ({ gameCommands: new Map() }));
jest.mock("./modals", () => ({ showError: jest.fn() }));

interface FakeSocket {
  url: string;
  readyState: number;
  closed: boolean;
  emit: (event: string) => void;
}

const mockedGlobalNames = [
  "WebSocket",
  "fetch",
  "navigator",
  "document",
  "location",
  "addEventListener",
  "$",
] as const;
const savedGlobalDescriptors = new Map<
  string,
  PropertyDescriptor | undefined
>();
const sockets: FakeSocket[] = [];

class MockSocket {
  static readonly CONNECTING = 0;
  static readonly OPEN = 1;
  static readonly CLOSED = 3;

  readonly url: string;
  readyState = MockSocket.CONNECTING;
  closed = false;
  private readonly listeners = new Map<string, () => void>();

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
  for (const name of mockedGlobalNames) {
    savedGlobalDescriptors.set(
      name,
      Object.getOwnPropertyDescriptor(globalThis, name),
    );
  }
  jest.useFakeTimers();
  jest.resetModules();
  sockets.length = 0;

  globalThis.WebSocket = MockSocket as unknown as typeof WebSocket;
  globalThis.fetch = jest
    .fn<typeof fetch>()
    .mockResolvedValue(new Response(null, { status: 200 }));
  Object.defineProperties(globalThis, {
    navigator: {
      configurable: true,
      value: { onLine: true },
    },
    document: {
      configurable: true,
      value: { visibilityState: "visible", addEventListener: jest.fn() },
    },
    location: {
      configurable: true,
      value: {
        hostname: "localhost",
        protocol: "https:",
        port: "",
        reload: jest.fn(),
      },
    },
    addEventListener: {
      configurable: true,
      value: jest.fn(),
    },
    $: {
      configurable: true,
      value: () => ({ html: () => "localhost" }),
    },
  });
});

afterEach(() => {
  jest.clearAllTimers();
  jest.useRealTimers();
  for (const [name, descriptor] of savedGlobalDescriptors) {
    if (descriptor === undefined) {
      Reflect.deleteProperty(globalThis, name);
    } else {
      Object.defineProperty(globalThis, name, descriptor);
    }
  }
  savedGlobalDescriptors.clear();
});

describe("initial WebSocket handshake watchdog", () => {
  test("recovers a permanently CONNECTING socket without a close event", async () => {
    const { websocketInit } = jest.requireActual<{
      websocketInit: () => void;
    }>("./websocketInit");
    websocketInit();
    expect(sockets).toHaveLength(1);

    await jest.advanceTimersByTimeAsync(14_999);
    expect(sockets).toHaveLength(1);
    await jest.advanceTimersByTimeAsync(1001);

    expect(sockets[0]?.closed).toBe(true);
    expect(sockets).toHaveLength(2);
    expect(sockets[1]?.url).toBe("wss://localhost/ws?reconnect=1");
    expect(globalThis.fetch).toHaveBeenCalledTimes(1);
  });

  test("a hanging reconnect cookie check times out and retries", async () => {
    let firstSignal: AbortSignal | null | undefined;
    const request = jest
      .fn<typeof fetch>()
      .mockImplementationOnce(
        async (_input, init) =>
          await new Promise<Response>((_resolve) => {
            firstSignal = init?.signal;
            // Deliberately never settle, even when the signal is aborted.
          }),
      )
      .mockResolvedValueOnce(new Response(null, { status: 200 }));
    globalThis.fetch = request;

    const { websocketInit } = jest.requireActual<{
      websocketInit: () => void;
    }>("./websocketInit");
    websocketInit();

    await jest.advanceTimersByTimeAsync(16_000);
    expect(request).toHaveBeenCalledTimes(1);
    expect(firstSignal?.aborted).toBe(false);

    await jest.advanceTimersByTimeAsync(10_000);
    expect(firstSignal?.aborted).toBe(true);
    expect(request).toHaveBeenCalledTimes(1);

    await jest.advanceTimersByTimeAsync(2000);
    expect(request).toHaveBeenCalledTimes(2);
    expect(sockets).toHaveLength(2);
    expect(sockets[1]?.url).toBe("wss://localhost/ws?reconnect=1");
  });

  test("clears handshake timers after open and welcome", async () => {
    const { websocketInit } = jest.requireActual<{
      websocketInit: () => void;
    }>("./websocketInit");
    const { globals } = jest.requireMock<{
      globals: {
        conn: { callbacks: Record<string, (data: unknown) => void> } | null;
      };
    }>("./Globals");
    websocketInit();

    sockets[0]?.emit("open");
    globals.conn?.callbacks["welcome"]?.({});

    await jest.advanceTimersByTimeAsync(30_000);
    expect(sockets).toHaveLength(1);
    expect(sockets[0]?.closed).toBe(false);
    expect(globalThis.fetch).not.toHaveBeenCalled();
  });

  test("recovers a socket opened without a welcome", async () => {
    const { websocketInit } = jest.requireActual<{
      websocketInit: () => void;
    }>("./websocketInit");
    websocketInit();
    sockets[0]?.emit("open");

    await jest.advanceTimersByTimeAsync(16_000);
    expect(sockets[0]?.closed).toBe(true);
    expect(sockets).toHaveLength(2);
  });
});
