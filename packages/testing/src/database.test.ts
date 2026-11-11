import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { setTimeout as delay } from "node:timers/promises";
import type postgres from "postgres";
import { evaluationDatabase } from "./database.ts";

const databaseDescribe =
  process.env["HANABI_TEST_DATABASE_URL"] === undefined
    ? describe.skip
    : describe;

databaseDescribe("disposable database administration", () => {
  let observer: Awaited<ReturnType<typeof evaluationDatabase>>;
  let client: postgres.Sql;

  beforeEach(async () => {
    observer = await evaluationDatabase();
    client = observer.connect();
  });

  afterEach(async () => {
    await client.end({ timeout: 3 });
    await observer.close();
  });

  test("concurrent database cleanup can outlast the application query budget", async () => {
    const attempts = Array.from({ length: 2 }, async () => {
      const database = await evaluationDatabase();
      const blocker = database.connect();
      try {
        await blocker`SELECT 1`;
        const closing = database.close();
        const releasing = delay(3000).then(async () => {
          await blocker.end({ timeout: 3 });
        });
        // Observe both outcomes before throwing, so failed cleanup cannot leave a timer running.
        await Promise.allSettled([closing, releasing]);
        await releasing;
        await closing;
        expect(
          await client`
            SELECT datname FROM pg_database
            WHERE datname = ${database.connection.database}
          `,
        ).toHaveLength(0);
      } finally {
        await blocker.end({ timeout: 3 });
        // Clean up this exact owned database even when testing the old, failing implementation.
        const cleanup = await client.reserve();
        try {
          await cleanup`SET statement_timeout = 30000`;
          await cleanup`DROP DATABASE IF EXISTS ${cleanup(database.connection.database)}`;
        } finally {
          await cleanup`RESET statement_timeout`;
          cleanup.release();
        }
      }
    });
    await Promise.allSettled(attempts);
    await Promise.all(attempts);
  }, 15_000);

  test("application statements still time out and the connection remains usable", async () => {
    expect(client`SELECT pg_sleep(3)`).rejects.toMatchObject({
      code: "57014",
    });
    expect(await client`SELECT 1 AS usable`).toEqual<unknown>([{ usable: 1 }]);
  });
});
