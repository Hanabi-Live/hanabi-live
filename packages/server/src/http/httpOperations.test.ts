import { ServerCommand } from "@hanabi-live/data";
import {
  afterEach,
  beforeEach,
  describe,
  expect,
  jest,
  test,
} from "@jest/globals";
import type { FastifyInstance } from "fastify";
import { announceServer } from "../administration";
import { incomingCommands } from "../commandAdmission";
import { getDatabasePoolReports } from "../db";
import { isMaintenanceMode, setMaintenanceMode } from "../maintenanceMode";
import { models } from "../models";
import { wsSendAll } from "../wsHelpers";
import { createOperationsServer, httpOperationsInit } from "./httpOperations";

jest.mock("../env", () => ({ env: { LOCALHOST_PORT: 0 }, IS_DEV: true }));
jest.mock("../administration", () => ({
  announceServer: jest
    .fn<(message: string) => Promise<void>>()
    .mockResolvedValue(undefined),
}));
jest.mock("../db", () => ({ getDatabasePoolReports: jest.fn() }));
jest.mock("../models", () => ({
  models: {
    moderation: { set: jest.fn() },
    users: { getByNormalizedUsername: jest.fn() },
  },
}));
jest.mock("../logger", () => ({
  logger: {
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
    debug: jest.fn(),
  },
}));
jest.mock("../wsHelpers", () => ({ wsSendAll: jest.fn() }));

const pools = {
  primary: {
    maxConnections: 10,
    totalConnections: 2,
    activeConnections: 1,
    idleConnections: 1,
    idleTransactionConnections: 0,
  },
  recovery: {
    maxConnections: 2,
    totalConnections: 1,
    activeConnections: 0,
    idleConnections: 1,
    idleTransactionConnections: 0,
  },
} satisfies Awaited<ReturnType<typeof getDatabasePoolReports>>;

describe("localhost operations", () => {
  let server: FastifyInstance;
  beforeEach(async () => {
    jest.clearAllMocks();
    jest.mocked(getDatabasePoolReports).mockResolvedValue(pools);
    server = await createOperationsServer();
  });
  afterEach(async () => {
    await server.close();
    await incomingCommands.drain();
    incomingCommands.resume();
    setMaintenanceMode(false);
  });

  test("binds only loopback and preserves an explicitly ephemeral operations port", async () => {
    await server.close();
    server = await httpOperationsInit();
    expect(server.server.listening).toBe(true);
    expect(server.server.address()).toMatchObject({
      address: "127.0.0.1",
      family: "IPv4",
      port: expect.any(Number),
    });
    const version = await server.inject({ url: "/version" });
    expect(version.statusCode).toBe(200);
    expect(version.body).toMatch(/^[\da-f]{40}\n$/u);
  });

  test("reports real pool roles and keeps read-only metrics available while draining", async () => {
    incomingCommands.pause();
    const result = await server.inject({ url: "/metrics" });
    expect(result.statusCode).toBe(200);
    expect(result.json<unknown>()).toMatchObject({
      draining: true,
      database: pools.primary,
      recovery: { database: pools.recovery, pendingTransactions: 0 },
      runtime: { heapBytes: expect.any(Number) },
    });
  });

  test("reports database observation failure explicitly without hiding other metrics", async () => {
    jest
      .mocked(getDatabasePoolReports)
      .mockRejectedValue(new Error("private database detail"));
    const result = await server.inject({ url: "/metrics" });
    expect(result.statusCode).toBe(503);
    expect(result.json<unknown>()).toMatchObject({
      database: { error: "Database pool activity is unavailable." },
      runtime: { heapBytes: expect.any(Number) },
    });
    expect(result.body).not.toContain("private database detail");
  });

  test("broadcasts maintenance transitions and rejects mutations during a drain", async () => {
    const started = await server.inject({ url: "/maintenance" });
    expect(started.statusCode).toBe(200);
    expect(isMaintenanceMode()).toBe(true);
    expect(wsSendAll).toHaveBeenCalledWith(ServerCommand.maintenance, {
      maintenanceMode: true,
    });
    const repeated = await server.inject({ url: "/maintenance" });
    expect(repeated.statusCode).toBe(400);
    incomingCommands.pause();
    const blocked = await server.inject({ url: "/unmaintenance" });
    expect(blocked.statusCode).toBe(503);
    expect(isMaintenanceMode()).toBe(true);
    incomingCommands.resume();
    const finished = await server.inject({ url: "/unmaintenance" });
    expect(finished.statusCode).toBe(200);
    expect(wsSendAll).toHaveBeenLastCalledWith(ServerCommand.maintenance, {
      maintenanceMode: false,
    });
  });

  test("reports a notice failure while retaining the already-published maintenance state", async () => {
    jest
      .mocked(announceServer)
      .mockRejectedValueOnce(new Error("storage unavailable"));
    const result = await server.inject({ url: "/maintenance" });
    expect(result.statusCode).toBe(500);
    expect(isMaintenanceMode()).toBe(true);
    expect(wsSendAll).toHaveBeenCalledWith(ServerCommand.maintenance, {
      maintenanceMode: true,
    });
  });

  test("rejects browser-origin administrative requests before changing state", async () => {
    const result = await server.inject({
      method: "POST",
      url: "/ban",
      payload: { username: "Alice" },
      headers: { origin: "https://example.test" },
    });
    expect(result.statusCode).toBe(403);
    expect(models.moderation.set).not.toHaveBeenCalled();
    const navigation = await server.inject({
      url: "/maintenance",
      headers: { "sec-fetch-site": "cross-site" },
    });
    expect(navigation.statusCode).toBe(403);
    expect(isMaintenanceMode()).toBe(false);
  });

  test("accepts the operator form protocol and reports invalid or missing users explicitly", async () => {
    const invalid = await server.inject({
      method: "POST",
      url: "/ban",
      payload: {},
    });
    expect(invalid.statusCode).toBe(400);
    jest.mocked(models.moderation.set).mockResolvedValue(undefined);
    const missing = await server.inject({
      method: "POST",
      url: "/mute",
      payload: "username=Nobody",
      headers: { "content-type": "application/x-www-form-urlencoded" },
    });
    expect(missing.body).toContain("does not exist");
    expect(models.moderation.set).toHaveBeenCalledWith("mute", "Nobody");
    incomingCommands.pause();
    const blocked = await server.inject({
      method: "POST",
      url: "/ban",
      payload: { username: "Alice" },
    });
    expect(blocked.statusCode).toBe(503);
    expect(models.moderation.set).toHaveBeenCalledTimes(1);
  });

  test("keeps retired emergency saves explicit", async () => {
    const result = await server.inject({ url: "/saveTables" });
    expect(result.statusCode).toBe(410);
    expect(result.body).toContain("no save was performed");
  });
});
