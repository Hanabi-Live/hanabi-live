import websocketPlugin from "@fastify/websocket";
import type { UserID } from "@hanabi-live/data";
import {
  afterEach,
  beforeEach,
  describe,
  expect,
  jest,
  test,
} from "@jest/globals";
import type { FastifyInstance } from "fastify";
import { fastify } from "fastify";
import { once } from "node:events";
import { setImmediate } from "node:timers/promises";
import { WebSocket } from "ws";
import { models } from "../models";
import { wsMessage } from "../wsMessage";
import { enqueueWSMsg, WSQueueElementType } from "../wsQueue";
import { httpWS, httpWSPreValidation } from "./httpWS";

jest.mock("../models", () => ({
  models: {
    users: {
      getWSData: jest.fn(),
      getUsername: jest.fn(),
      setLastLogin: jest.fn(),
    },
  },
}));
jest.mock("../httpSession", () => ({
  getCookieValue: () => 1,
  deleteCookie: jest.fn(),
}));
jest.mock("../logger", () => ({
  logger: { info: jest.fn(), warn: jest.fn(), error: jest.fn() },
}));
jest.mock("../wsHelpers", () => ({ wsError: jest.fn() }));
jest.mock("../wsMessage", () => ({ wsMessage: jest.fn() }));
jest.mock("../wsQueue", () => ({
  WSQueueElementType: { Login: 0, Logout: 1 },
  enqueueWSMsg: jest.fn(),
}));

let app: FastifyInstance;
let socket: WebSocket;
let serverSocket: WebSocket;

async function connect() {
  app = fastify();
  await app.register(websocketPlugin, { options: { maxPayload: 8192 } });
  app.get(
    "/ws",
    { websocket: true, preValidation: httpWSPreValidation },
    (connection, request) => {
      serverSocket = connection;
      httpWS(connection, request);
    },
  );
  const address = await app.listen({ port: 0, host: "127.0.0.1" });
  socket = new WebSocket(`${address.replace("http:", "ws:")}/ws`);
  await once(socket, "open");
}

describe("WebSocket command sequencing", () => {
  beforeEach(() => {
    jest.resetAllMocks();
    jest.mocked(models.users.getWSData).mockResolvedValue({
      username: "Alice",
      normalizedUsername: "alice",
      hyphenated: false,
      friends: new Set<UserID>(),
      muted: false,
    });
    jest.mocked(models.users.setLastLogin).mockResolvedValue(undefined);
    jest.mocked(models.users.getUsername).mockResolvedValue("Alice");
    jest.mocked(enqueueWSMsg).mockResolvedValue(undefined);
    jest.mocked(wsMessage).mockResolvedValue(undefined);
  });

  afterEach(async () => {
    const closed =
      serverSocket.readyState === serverSocket.CLOSED
        ? undefined
        : once(serverSocket, "close");
    socket.terminate();
    await closed;
    await app.close();
    await setImmediate();
  });

  test("buffers early commands until initialization and executes them in order", async () => {
    const login = Promise.withResolvers<undefined>();
    const firstStarted = Promise.withResolvers<undefined>();
    const firstFinished = Promise.withResolvers<undefined>();
    const secondStarted = Promise.withResolvers<undefined>();
    jest.mocked(enqueueWSMsg).mockReturnValueOnce(login.promise);
    jest.mocked(wsMessage).mockImplementationOnce(async () => {
      firstStarted.resolve(undefined);
      await firstFinished.promise;
    });
    jest.mocked(wsMessage).mockImplementationOnce(async () => {
      secondStarted.resolve(undefined);
      await Promise.resolve();
    });
    try {
      await connect();
      socket.send('chat {"msg":"first","room":"lobby"}');
      socket.send('chat {"msg":"second","room":"lobby"}');
      await setImmediate();
      expect(wsMessage).not.toHaveBeenCalled();
      login.resolve(undefined);
      await firstStarted.promise;
      expect(wsMessage).toHaveBeenCalledTimes(1);
      firstFinished.resolve(undefined);
      await secondStarted.promise;
      const messages = jest.mocked(wsMessage).mock.calls.map((call) => call[1]);
      expect(messages).toEqual([
        Buffer.from('chat {"msg":"first","room":"lobby"}'),
        Buffer.from('chat {"msg":"second","room":"lobby"}'),
      ]);
    } finally {
      login.resolve(undefined);
      firstFinished.resolve(undefined);
    }
  });

  test("closes failed commands and still cleans up the authenticated session", async () => {
    const loggedOut = Promise.withResolvers<undefined>();
    jest.mocked(wsMessage).mockRejectedValueOnce(new Error("storage failed"));
    jest.mocked(enqueueWSMsg).mockImplementation(async (type) => {
      if (type === WSQueueElementType.Logout) {
        loggedOut.resolve(undefined);
      }
      await Promise.resolve();
    });
    await connect();
    const closed = once(socket, "close");
    socket.send('chat {"msg":"hello","room":"lobby"}');
    const closeArgs: readonly unknown[] = await closed;
    await loggedOut.promise;
    expect(closeArgs[0]).toBe(1011);
    expect(jest.mocked(enqueueWSMsg).mock.calls.map((call) => call[0])).toEqual(
      [WSQueueElementType.Login, WSQueueElementType.Logout],
    );
  });

  test("bounds queued commands while login is still loading", async () => {
    const login = Promise.withResolvers<undefined>();
    jest.mocked(enqueueWSMsg).mockReturnValueOnce(login.promise);
    try {
      await connect();
      const closed = once(socket, "close");
      for (let i = 0; i < 65; i++) {
        socket.send('chat {"msg":"hello","room":"lobby"}');
      }
      const closeArgs: readonly unknown[] = await closed;
      expect(closeArgs[0]).toBe(1008);
      expect(wsMessage).not.toHaveBeenCalled();
    } finally {
      login.resolve(undefined);
    }
  });

  test("a failed bootstrap does not execute queued messages", async () => {
    jest
      .mocked(enqueueWSMsg)
      .mockRejectedValueOnce(new Error("history unavailable"));
    await connect();
    const closeArgs: readonly unknown[] = await once(socket, "close");
    expect(closeArgs[0]).toBe(1011);
    expect(wsMessage).not.toHaveBeenCalled();
  });
});
