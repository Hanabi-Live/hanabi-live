import { afterEach, describe, expect, jest, test } from "@jest/globals";
import type { WebSocket } from "ws";
import { incomingCommands } from "./commandAdmission";
import { shutdownServer } from "./lifecycle";

jest.mock("./logger", () => ({
  logger: { warn: jest.fn(), error: jest.fn() },
}));

afterEach(async () => {
  await incomingCommands.drain();
  incomingCommands.resume();
});

function resources() {
  const calls: string[] = [];
  const runtime = {
    quiesce() {
      calls.push("quiesce");
    },
    checkpointAndDrain: jest
      .fn<() => Promise<void>>()
      .mockImplementation(async () => {
        calls.push("checkpoint");
        await Promise.resolve();
      }),
    close: jest.fn<() => Promise<void>>().mockImplementation(async () => {
      calls.push("runtime");
      await Promise.resolve();
    }),
  };
  const server = {
    websocketServer: { clients: new Set<WebSocket>() },
    close: jest.fn<() => Promise<void>>().mockImplementation(async () => {
      calls.push("http");
      await Promise.resolve();
    }),
  };
  const closeDatabase = jest
    .fn<() => Promise<void>>()
    .mockImplementation(async () => {
      calls.push("database");
      await Promise.resolve();
    });
  return { calls, runtime, server, closeDatabase };
}

describe("graceful process lifecycle", () => {
  test("settles admitted work before saving checkpoints and closes the database last", async () => {
    const { calls, runtime, server, closeDatabase } = resources();
    const release = Promise.withResolvers<undefined>();
    const command = incomingCommands.run(async () => {
      await release.promise;
    });
    const stopped = shutdownServer(runtime, server, closeDatabase);
    try {
      await Promise.resolve();
      expect(calls).toEqual(["quiesce"]);
      expect(await incomingCommands.run(() => undefined)).toBe(false);
    } finally {
      release.resolve(undefined);
      await command;
      await stopped;
    }
    expect(calls).toEqual([
      "quiesce",
      "checkpoint",
      "http",
      "runtime",
      "database",
    ]);
  });

  test("failed checkpoints leave connections and storage open for a paused retry", async () => {
    const { runtime, server, closeDatabase } = resources();
    runtime.checkpointAndDrain.mockRejectedValueOnce(
      new Error("uncertain checkpoint"),
    );
    await expect(
      shutdownServer(runtime, server, closeDatabase),
    ).rejects.toThrow("uncertain checkpoint");
    expect(server.close).not.toHaveBeenCalled();
    expect(runtime.close).not.toHaveBeenCalled();
    expect(closeDatabase).not.toHaveBeenCalled();
    expect(await incomingCommands.run(() => undefined)).toBe(false);
    await shutdownServer(runtime, server, closeDatabase);
    expect(closeDatabase).toHaveBeenCalledTimes(1);
  });
});
